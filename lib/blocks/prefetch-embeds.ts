import { unstable_cache } from 'next/cache';
import { getFromS3 } from '@/lib/s3/fetch';

interface BlockLike {
  type?: string;
  url?: string;
  inlineHtml?: string;
  blocks?: BlockLike[];
  columns?: Array<{ blocks?: BlockLike[] }>;
}

// 60s TTL is short enough that an editor save is visible quickly without
// requiring an explicit revalidate. Keyed by S3 key so a re-uploaded file
// (which gets a new UUID via uploadToS3) immediately misses cache.
const fetchEmbedHtml = unstable_cache(
  async (key: string): Promise<string | null> => {
    try {
      const { buffer } = await getFromS3(key);
      return buffer.toString('utf8');
    } catch (err) {
      console.warn('[prefetch-embeds] s3 fetch failed for', key, err instanceof Error ? err.message : err);
      return null;
    }
  },
  ['html-embed-body'],
  { revalidate: 60, tags: ['html-embed-body'] }
);

// Walk the block tree, find every html-embed, and inline its HTML from S3 so
// the embedded markup is part of the initial server-rendered response —
// crawlers see the text content instead of an opaque iframe. Mutates blocks
// in place; returns the re-stringified content. Failures leave the original
// `url` in place so the renderer can fall back to the iframe path.
export async function prefetchHtmlEmbeds(content: string): Promise<string> {
  let parsed: { blocks?: BlockLike[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  if (!parsed || !Array.isArray(parsed.blocks)) return content;

  await visit(parsed.blocks);
  return JSON.stringify(parsed);
}

async function visit(blocks: BlockLike[]): Promise<void> {
  // Resolve every html-embed in parallel — a page with multiple embeds was
  // doing serial S3 GETs before the cache hit. With caching most of these are
  // memory hits anyway, but parallelizing the cold path is essentially free.
  const tasks: Array<Promise<void>> = [];
  function walk(list: BlockLike[]): void {
    for (const b of list) {
      if (b?.type === 'html-embed' && b.url) {
        const key = extractS3Key(b.url);
        if (key) {
          tasks.push(
            fetchEmbedHtml(key).then((html) => {
              if (html !== null) b.inlineHtml = html;
            })
          );
        }
      }
      if (Array.isArray(b?.blocks)) walk(b.blocks);
      if (Array.isArray(b?.columns)) {
        for (const col of b.columns) {
          if (Array.isArray(col?.blocks)) walk(col.blocks);
        }
      }
    }
  }
  walk(blocks);
  await Promise.all(tasks);
}

function extractS3Key(url: string): string | null {
  const m = url.match(/\/api\/media\/proxy\/(.+)$/);
  if (!m) return null;
  return m[1].split('?')[0];
}
