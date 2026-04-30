import { getFromS3 } from '@/lib/s3/fetch';

interface BlockLike {
  type?: string;
  url?: string;
  inlineHtml?: string;
  blocks?: BlockLike[];
  columns?: Array<{ blocks?: BlockLike[] }>;
}

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
  for (const b of blocks) {
    if (b?.type === 'html-embed' && b.url) {
      const key = extractS3Key(b.url);
      if (key) {
        try {
          const { buffer } = await getFromS3(key);
          b.inlineHtml = buffer.toString('utf8');
        } catch (err) {
          console.warn('[prefetch-embeds] failed for', b.url, err instanceof Error ? err.message : err);
        }
      }
    }
    if (Array.isArray(b?.blocks)) await visit(b.blocks);
    if (Array.isArray(b?.columns)) {
      for (const col of b.columns) {
        if (Array.isArray(col?.blocks)) await visit(col.blocks);
      }
    }
  }
}

function extractS3Key(url: string): string | null {
  const m = url.match(/\/api\/media\/proxy\/(.+)$/);
  if (!m) return null;
  return m[1].split('?')[0];
}
