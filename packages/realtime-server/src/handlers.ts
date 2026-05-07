// Yjs sync + awareness protocol handlers. Per-doc state held in DocRoom.
//
// Wire format follows the standard y-websocket setup:
//   varuint messageType
//   ... message body
// where messageType is one of:
//   0 — sync
//   1 — awareness
//   3 — auth (we don't use; gate at handshake)
//
// On `sync`, we delegate to `y-protocols/sync` which produces step-1/step-2
// responses and applies updates to the local Y.Doc. On `awareness`, we
// delegate to `y-protocols/awareness` and rebroadcast.

import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocket } from 'ws';
import type { RealtimeJwtClaims } from './auth.js';
import { SnapshotPersistence } from './persistence.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export interface DocConn {
  socket: WebSocket;
  user: RealtimeJwtClaims;
  /** Awareness clientIDs this connection currently owns (cleaned on close). */
  controlledAwarenessIds: Set<number>;
}

export class DocRoom {
  readonly docKey: string;
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  readonly conns = new Set<DocConn>();
  private persistence: SnapshotPersistence;
  private docUpdateHandler: (update: Uint8Array, origin: unknown) => void;
  private awarenessUpdateHandler: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => void;
  private destroyed = false;

  constructor(docKey: string, persistence: SnapshotPersistence) {
    this.docKey = docKey;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.persistence = persistence;

    // Broadcast doc updates to all connected peers (except the origin).
    this.docUpdateHandler = (update, origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const buf = encoding.toUint8Array(encoder);
      for (const conn of this.conns) {
        if (conn.socket === origin) continue;
        sendBinary(conn.socket, buf);
      }
      // Schedule snapshot.
      this.persistence.scheduleFlush(this.docKey, this.doc);
    };
    this.doc.on('update', this.docUpdateHandler);

    this.awarenessUpdateHandler = (changes, origin) => {
      const changedClients = changes.added
        .concat(changes.updated)
        .concat(changes.removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const buf = encoding.toUint8Array(encoder);
      for (const conn of this.conns) {
        if (conn.socket === origin) continue;
        sendBinary(conn.socket, buf);
      }
    };
    this.awareness.on('update', this.awarenessUpdateHandler);
  }

  /** Send the initial sync handshake (step 1) to a freshly joined peer. */
  sendInitialSync(socket: WebSocket): void {
    // Sync step 1: ask peer for missing updates.
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(syncEncoder, this.doc);
    sendBinary(socket, encoding.toUint8Array(syncEncoder));

    // Send full awareness snapshot.
    const states = this.awareness.getStates();
    if (states.size > 0) {
      const awEncoder = encoding.createEncoder();
      encoding.writeVarUint(awEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(states.keys())
        )
      );
      sendBinary(socket, encoding.toUint8Array(awEncoder));
    }
  }

  handleMessage(conn: DocConn, data: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(data);
      const encoder = encoding.createEncoder();
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MESSAGE_SYNC: {
          if (conn.user.scope !== 'write') {
            // Read-only — ignore inbound sync (peer can still receive our state).
            return;
          }
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, conn.socket);
          if (encoding.length(encoder) > 1) {
            sendBinary(conn.socket, encoding.toUint8Array(encoder));
          }
          break;
        }
        case MESSAGE_AWARENESS: {
          const update = decoding.readVarUint8Array(decoder);
          // Track which awareness clientIDs this connection authored so we
          // can clean them up on disconnect.
          const updateDecoder = decoding.createDecoder(update);
          const len = decoding.readVarUint(updateDecoder);
          for (let i = 0; i < len; i++) {
            const clientId = decoding.readVarUint(updateDecoder);
            // skip clock + state body
            decoding.readVarUint(updateDecoder); // clock
            decoding.readVarString(updateDecoder); // state json
            conn.controlledAwarenessIds.add(clientId);
          }
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            update,
            conn.socket
          );
          break;
        }
        default:
          // Unknown message type — ignore.
          break;
      }
    } catch (err) {
      console.error(
        `[realtime-server] ${this.docKey} message error:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  /**
   * Apply an arbitrary Y update binary (from MCP / internal channel) and
   * broadcast it to all connected peers.
   */
  applyExternalUpdate(update: Uint8Array, origin: string): void {
    Y.applyUpdate(this.doc, update, origin);
    // doc.on('update') runs naturally, but it filters by `origin === socket`.
    // Since we passed a non-socket origin string, every connection will
    // receive the update via the broadcast loop above.
  }

  addConnection(conn: DocConn): void {
    this.conns.add(conn);
  }

  removeConnection(conn: DocConn): void {
    this.conns.delete(conn);
    if (conn.controlledAwarenessIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        Array.from(conn.controlledAwarenessIds),
        null
      );
    }
  }

  isEmpty(): boolean {
    return this.conns.size === 0;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    // Force one last flush.
    try {
      await this.persistence.flush(this.docKey, this.doc);
    } catch {
      // Already logged in flush.
    }
    this.persistence.cancelFlush(this.docKey);
    this.doc.off('update', this.docUpdateHandler);
    this.awareness.off('update', this.awarenessUpdateHandler);
    this.awareness.destroy();
    this.doc.destroy();
  }
}

function sendBinary(socket: WebSocket, buf: Uint8Array): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(buf, { binary: true }, (err) => {
    if (err) {
      console.warn(
        '[realtime-server] send failed:',
        err instanceof Error ? err.message : err
      );
    }
  });
}
