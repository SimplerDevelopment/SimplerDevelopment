/**
 * Renders a post's stored content.
 *
 * Takes the raw `content` string straight off the SDK's `Post` and does the
 * parsing for you — see lib/content.ts for why that step exists at all.
 */
import { parseBlocks } from '@/lib/content';
import { BlockList } from './blocks';

export function BlockRenderer({ content }: { content: string | null | undefined }) {
  const blocks = parseBlocks(content);
  if (blocks.length === 0) return null;
  return <BlockList blocks={blocks} />;
}
