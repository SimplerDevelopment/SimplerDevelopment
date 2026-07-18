// Realtime WebSocket server. One Y.Doc per (entityType, entityId) pair held
// in-memory; peers join by opening a WebSocket to /<entityType>:<entityId>
// with a `?token=...` query param (verified in `auth.ts`).
//
// Side channels:
//   GET  /health             — { ok, docs }
//   POST /internal/apply     — privileged Y update injection (MCP fan-out)
//                              header `X-Internal-Secret: <REALTIME_INTERNAL_SECRET>`
//                              body   { docKey, update: <base64-encoded Y update> }

import http from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyHandshake, safeEqual } from './auth.js';
import { DocRoom, type DocConn } from './handlers.js';
import { SnapshotPersistence } from './persistence.js';

// Bind Railway's injected $PORT first so the platform healthcheck/proxy hit
// the right port; fall back to REALTIME_PORT, then 3030 for local dev.
const PORT = Number.parseInt(
  process.env.PORT ?? process.env.REALTIME_PORT ?? '3030',
  10
);
const INTERNAL_SECRET = process.env.REALTIME_INTERNAL_SECRET ?? '';

const persistence = new SnapshotPersistence(process.env.DATABASE_URL);
const docs = new Map<string, DocRoom>();

function getOrCreateDoc(docKey: string): DocRoom {
  let room = docs.get(docKey);
  if (!room) {
    room = new DocRoom(docKey, persistence);
    docs.set(docKey, room);
  }
  return room;
}

async function maybeRetireDoc(room: DocRoom): Promise<void> {
  if (!room.isEmpty()) return;
  docs.delete(room.docKey);
  await room.destroy();
}

// ─── HTTP server ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, docs: docs.size }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/internal/apply') {
    if (!INTERNAL_SECRET) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: false,
          message: 'REALTIME_INTERNAL_SECRET not configured',
        })
      );
      return;
    }
    const provided = req.headers['x-internal-secret'];
    const providedStr = Array.isArray(provided) ? provided[0] : provided;
    if (!providedStr || !safeEqual(providedStr, INTERNAL_SECRET)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'Forbidden' }));
      return;
    }

    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body: { docKey?: string; update?: string };
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'Invalid JSON' }));
      return;
    }
    if (!body.docKey || !body.update) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, message: 'docKey + update required' })
      );
      return;
    }
    let updateBytes: Uint8Array;
    try {
      updateBytes = new Uint8Array(Buffer.from(body.update, 'base64'));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ ok: false, message: 'update must be base64' })
      );
      return;
    }

    const room = getOrCreateDoc(body.docKey);
    room.applyExternalUpdate(updateBytes, 'mcp:apply');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, message: 'Not found' }));
});

// ─── WebSocket upgrade ───────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  try {
    const url = new URL(
      req.url ?? '/',
      `http://${req.headers.host ?? 'localhost'}`
    );
    // Path is `/{docKey}` — y-websocket uses room as the URL pathname after
    // stripping the leading slash.
    const requestedRoom = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const token = url.searchParams.get('token');

    const result = verifyHandshake({ token, requestedRoom });
    if (!result.ok) {
      socket.write(
        `HTTP/1.1 ${result.status} ${result.message}\r\n` +
          'Connection: close\r\n' +
          '\r\n'
      );
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, result.claims);
    });
  } catch (err) {
    console.error(
      '[realtime-server] upgrade error:',
      err instanceof Error ? err.message : err
    );
    socket.destroy();
  }
});

import type { IncomingMessage } from 'node:http';
import type { RealtimeJwtClaims } from './auth.js';

wss.on(
  'connection',
  (ws: WebSocket, _req: IncomingMessage, claims: RealtimeJwtClaims) => {
    const room = getOrCreateDoc(claims.docKey);

    const conn: DocConn = {
      socket: ws,
      user: claims,
      controlledAwarenessIds: new Set(),
    };
    room.addConnection(conn);
    room.sendInitialSync(ws);

    ws.binaryType = 'nodebuffer';
    ws.on('message', (data) => {
      const buf =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : Array.isArray(data)
            ? new Uint8Array(Buffer.concat(data))
            : new Uint8Array(data as Buffer);
      room.handleMessage(conn, buf);
    });

    ws.on('close', async () => {
      room.removeConnection(conn);
      // If this was the last peer, retire the room (after one last flush).
      await maybeRetireDoc(room);
    });

    ws.on('error', (err) => {
      console.warn(
        `[realtime-server] socket error on ${claims.docKey}:`,
        err.message
      );
    });
  }
);

// ─── Boot ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[realtime-server] listening on :${PORT}`);
  if (!process.env.REALTIME_JWT_SECRET) {
    console.warn(
      '[realtime-server] WARNING: REALTIME_JWT_SECRET is not set; all connections will be rejected.'
    );
  }
  if (!INTERNAL_SECRET) {
    console.warn(
      '[realtime-server] WARNING: REALTIME_INTERNAL_SECRET is not set; /internal/apply will return 503.'
    );
  }
});

async function shutdown(): Promise<void> {
  console.log('[realtime-server] shutting down...');
  // Force-flush every doc.
  await Promise.all(
    Array.from(docs.values()).map(async (room) => {
      try {
        await persistence.flush(room.docKey, room.doc);
      } catch (err) {
        console.error('flush failed during shutdown:', err);
      }
    })
  );
  for (const room of docs.values()) await room.destroy();
  docs.clear();
  await persistence.close();
  server.close(() => process.exit(0));
  // Hard-exit fallback.
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
