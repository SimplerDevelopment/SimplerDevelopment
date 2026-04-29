/**
 * Embedding + semantic-search layer for Company Brain. Phase 6.
 *
 * Provider-agnostic: the `embedText` function takes any string array and
 * returns vectors. Default provider is OpenAI text-embedding-3-small (1536d,
 * cheap, good enough). Swap by adding a branch and changing
 * brain_profiles.embeddingProvider — code is structured so the rest of the
 * system doesn't care which provider produced a vector, as long as the
 * dimensions match the column declaration.
 *
 * Storage: brain_embeddings table, one row per (entity, chunk). HNSW cosine
 * index on the vector column. Re-embedding is upsert-by-(entity, chunk_index).
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export type EmbeddingProvider = 'openai' | 'voyage' | 'cohere';
export type EntityType = 'note' | 'meeting' | 'relationship';

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIM = 1536;

interface EmbedResult {
  vector: number[];
  tokens: number;
}

/**
 * Embed a batch of strings via the configured provider. Returns one vector per
 * input string in the same order. Handles batching internally — OpenAI accepts
 * up to ~2048 inputs per call but we cap at 100 to keep request bodies sane
 * and to make per-batch retries cheap.
 */
export async function embedText(
  inputs: string[],
  opts: { provider?: EmbeddingProvider; model?: string } = {},
): Promise<EmbedResult[]> {
  const provider = opts.provider ?? 'openai';
  if (provider !== 'openai') {
    throw new Error(`Embedding provider "${provider}" not yet implemented`);
  }
  const model = opts.model ?? DEFAULT_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const results: EmbedResult[] = [];
  const BATCH_SIZE = 100;

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI embeddings failed: ${res.status} ${txt}`);
    }
    const json = await res.json() as {
      data: { embedding: number[]; index: number }[];
      usage: { prompt_tokens: number; total_tokens: number };
    };
    // Tokens are reported per-call, not per-input. Distribute proportionally
    // by char count so per-row token attribution is approximately correct
    // for cost accounting.
    const totalChars = batch.reduce((s, t) => s + t.length, 0) || 1;
    for (const item of json.data) {
      const charShare = batch[item.index].length / totalChars;
      results.push({
        vector: item.embedding,
        tokens: Math.round(json.usage.total_tokens * charShare),
      });
    }
  }

  return results;
}

/**
 * Markdown-aware chunker. Tries to break on H2/H3 boundaries, then paragraphs,
 * then sentences. Targets ~500 tokens per chunk with ~100-token overlap.
 *
 * Token estimation is char-based (chars / 4) — fine for English markdown,
 * within ~10% of true tiktoken count. Don't optimize unless it matters.
 */
const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 100;
const TARGET_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

export function chunkMarkdown(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= TARGET_CHARS) return [trimmed];

  // First pass: split on H2/H3 headings. Anything before the first heading
  // becomes its own section.
  const sections = trimmed.split(/(?=^##+\s)/m).filter(s => s.trim().length > 0);

  const chunks: string[] = [];
  for (const section of sections) {
    if (section.length <= TARGET_CHARS) {
      chunks.push(section.trim());
      continue;
    }
    // Section too big — fall through to paragraph splitting with overlap.
    const paragraphs = section.split(/\n\n+/);
    let buf = '';
    for (const p of paragraphs) {
      if ((buf + '\n\n' + p).length > TARGET_CHARS && buf.length > 0) {
        chunks.push(buf.trim());
        // Carry the tail of the previous chunk forward as overlap so context
        // isn't lost at chunk boundaries.
        buf = buf.slice(-OVERLAP_CHARS) + '\n\n' + p;
      } else {
        buf = buf.length > 0 ? `${buf}\n\n${p}` : p;
      }
    }
    if (buf.trim().length > 0) chunks.push(buf.trim());
  }

  return chunks;
}

/**
 * Embed a brain entity (note, meeting, relationship) and store the vectors.
 * Atomically replaces all existing chunks for that entity. Returns the number
 * of chunks written.
 */
export async function embedEntity(args: {
  clientId: number;
  entityType: EntityType;
  entityId: number;
  content: string;
  provider?: EmbeddingProvider;
  model?: string;
}): Promise<{ chunks: number; tokens: number }> {
  const chunks = chunkMarkdown(args.content);
  if (chunks.length === 0) {
    // Nothing to embed — clear any prior chunks and return.
    await db.execute(sql`
      DELETE FROM brain_embeddings
      WHERE entity_type = ${args.entityType} AND entity_id = ${args.entityId}
    `);
    return { chunks: 0, tokens: 0 };
  }

  const model = args.model ?? DEFAULT_MODEL;
  const provider = args.provider ?? 'openai';
  const dim = DEFAULT_DIM;

  const results = await embedText(chunks, { provider, model });

  // Replace strategy: delete all existing chunks for this entity, then bulk
  // insert. Done in a single transaction so a partial failure doesn't leave
  // the entity half-embedded.
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM brain_embeddings
      WHERE entity_type = ${args.entityType} AND entity_id = ${args.entityId}
    `);
    for (let i = 0; i < chunks.length; i++) {
      const v = results[i].vector;
      // pgvector accepts the array literal as a string '[1,2,...]'.
      const vectorLiteral = `[${v.join(',')}]`;
      await tx.execute(sql`
        INSERT INTO brain_embeddings
          (client_id, entity_type, entity_id, chunk_index, content, vector, model, dim, tokens)
        VALUES (
          ${args.clientId},
          ${args.entityType},
          ${args.entityId},
          ${i},
          ${chunks[i]},
          ${vectorLiteral}::vector,
          ${model},
          ${dim},
          ${results[i].tokens}
        )
      `);
    }
  });

  const totalTokens = results.reduce((s, r) => s + r.tokens, 0);
  return { chunks: chunks.length, tokens: totalTokens };
}

/**
 * Remove all embeddings for an entity. Call from delete handlers so vectors
 * don't outlive their source content.
 */
export async function removeEmbeddings(entityType: EntityType, entityId: number): Promise<void> {
  await db.execute(sql`
    DELETE FROM brain_embeddings
    WHERE entity_type = ${entityType} AND entity_id = ${entityId}
  `);
}

export interface SemanticHit {
  entityType: EntityType;
  entityId: number;
  chunkIndex: number;
  content: string;
  similarity: number; // 1 - cosine_distance, so 1.0 = identical, 0 = orthogonal
}

/**
 * Vector similarity search. Returns top-k chunks across all entity types
 * (filterable). Caller is responsible for deduplicating by entityId if it
 * only wants one result per source doc.
 */
export async function searchSemantic(args: {
  clientId: number;
  query: string;
  k?: number;
  entityTypes?: EntityType[];
  provider?: EmbeddingProvider;
  model?: string;
}): Promise<SemanticHit[]> {
  const k = Math.max(1, Math.min(args.k ?? 25, 200));
  const [{ vector }] = await embedText([args.query], {
    provider: args.provider,
    model: args.model,
  });
  const vectorLiteral = `[${vector.join(',')}]`;

  // Build the type filter clause inline since drizzle's sql tag handles arrays
  // poorly for `IN (...)` cases. Validate input strictly to keep this safe.
  const allowed: EntityType[] = ['note', 'meeting', 'relationship'];
  const types = (args.entityTypes ?? allowed).filter(t => allowed.includes(t));
  if (types.length === 0) return [];

  const typeList = types.map(t => `'${t}'`).join(',');

  const rows = await db.execute(sql`
    SELECT
      entity_type,
      entity_id,
      chunk_index,
      content,
      1 - (vector <=> ${vectorLiteral}::vector) AS similarity
    FROM brain_embeddings
    WHERE client_id = ${args.clientId}
      AND entity_type IN (${sql.raw(typeList)})
    ORDER BY vector <=> ${vectorLiteral}::vector ASC
    LIMIT ${k}
  `);

  return (rows as unknown as Array<{
    entity_type: EntityType;
    entity_id: number;
    chunk_index: number;
    content: string;
    similarity: number;
  }>).map(r => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    similarity: Number(r.similarity),
  }));
}
