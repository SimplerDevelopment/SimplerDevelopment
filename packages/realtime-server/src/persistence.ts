// Debounced Postgres snapshot persistence. After each Y.Doc update, we
// schedule a flush 2s later that writes the doc state back to the
// underlying table column.
//
// IMPORTANT: this file does NOT import drizzle — the realtime-server runs as
// a standalone Node process. The table/column mapping is hard-coded below
// and must stay in sync with `lib/db/schema/cms.ts` (posts.content),
// `lib/db/schema/tools.ts` (pitch_decks.slides), and `lib/db/schema/email.ts`
// (email_campaigns.block_content).

import postgres from 'postgres';
import * as Y from 'yjs';
import { yArrayToJSON } from './doc-shared.js';

const FLUSH_DELAY_MS = 2_000;

export type EntityType = 'post' | 'deck' | 'email';

interface ParsedDocKey {
  entityType: EntityType;
  entityId: string;
}

export function parseDocKey(key: string): ParsedDocKey | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const entityType = key.slice(0, idx);
  const entityId = key.slice(idx + 1);
  if (entityType !== 'post' && entityType !== 'deck' && entityType !== 'email')
    return null;
  if (!entityId) return null;
  return { entityType, entityId };
}

export class SnapshotPersistence {
  private sql: postgres.Sql | null;
  private pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(databaseUrl: string | undefined) {
    if (!databaseUrl) {
      console.warn(
        '[realtime-server] DATABASE_URL not set — snapshot persistence disabled (in-memory only).'
      );
      this.sql = null;
      return;
    }
    this.sql = postgres(databaseUrl, { max: 4, idle_timeout: 30 });
  }

  /** Schedule a flush for the given doc — coalesces bursts of updates. */
  scheduleFlush(docKey: string, doc: Y.Doc): void {
    if (!this.sql) return;
    const existing = this.pending.get(docKey);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pending.delete(docKey);
      this.flush(docKey, doc).catch((err) => {
        console.error(
          `[realtime-server] flush failed for ${docKey}:`,
          err instanceof Error ? err.message : err
        );
      });
    }, FLUSH_DELAY_MS);
    this.pending.set(docKey, timer);
  }

  /** Cancel a pending flush (used on document close). */
  cancelFlush(docKey: string): void {
    const t = this.pending.get(docKey);
    if (t) {
      clearTimeout(t);
      this.pending.delete(docKey);
    }
  }

  /** Force an immediate flush, bypassing debounce. */
  async flush(docKey: string, doc: Y.Doc): Promise<void> {
    if (!this.sql) return;
    const parsed = parseDocKey(docKey);
    if (!parsed) return;

    const numericId = Number.parseInt(parsed.entityId, 10);
    if (Number.isNaN(numericId)) {
      console.warn(
        `[realtime-server] skip flush, non-numeric entityId: ${docKey}`
      );
      return;
    }

    if (parsed.entityType === 'post') {
      const yArr = doc.getArray<Y.Map<unknown>>('blocks');
      const blocks = yArrayToJSON(yArr);
      // posts.content is `text NOT NULL` storing JSON `{ blocks, version }`.
      const payload = JSON.stringify({ blocks, version: '1.0' });
      await this.sql`
        update posts
        set content = ${payload}, updated_at = now()
        where id = ${numericId}
      `;
      return;
    }

    if (parsed.entityType === 'deck') {
      const yArr = doc.getArray<Y.Map<unknown>>('slides');
      const slides = yArrayToJSON(yArr);
      // pitch_decks.slides is JSON. The `postgres.JSONValue` type is overly
      // strict for our nested-array payload; cast at the boundary.
      await this.sql`
        update pitch_decks
        set slides = ${this.sql.json(slides as unknown as postgres.JSONValue)},
            format_version = 2,
            updated_at = now()
        where id = ${numericId}
      `;
      return;
    }

    if (parsed.entityType === 'email') {
      const yArr = doc.getArray<Y.Map<unknown>>('blocks');
      const blocks = yArrayToJSON(yArr);
      // email_campaigns.block_content is JSON, expected shape `{ blocks, version }`.
      const payload = { blocks, version: '1' };
      await this.sql`
        update email_campaigns
        set block_content = ${this.sql.json(payload as unknown as postgres.JSONValue)},
            updated_at = now()
        where id = ${numericId}
      `;
      return;
    }
  }

  async close(): Promise<void> {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    if (this.sql) await this.sql.end({ timeout: 5 });
  }
}
