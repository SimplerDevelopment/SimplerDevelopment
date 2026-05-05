/**
 * Wrap a post's serialized block content with its content type's template, if
 * the type has one.
 *
 * The template is a `{ blocks, version }` JSON blob — same shape as
 * posts.content. At render time the post's own blocks replace any
 * `{ type: 'post-content' }` placeholder block found anywhere in the template
 * tree (including inside columns / sections / tabs / etc.). If the template
 * has no placeholder, the post's blocks are appended at the end so the
 * template is still useful as a header/footer wrapper.
 *
 * Returns the same JSON-string shape that the rest of the renderer expects.
 */
interface BlockLike {
  type?: string;
  id?: string;
  order?: number;
  blocks?: BlockLike[];
  columns?: Array<{ blocks?: BlockLike[] }>;
  [key: string]: unknown;
}

interface ParsedContent {
  blocks?: BlockLike[];
  version?: string;
}

const POST_CONTENT_TYPE = 'post-content';

export function wrapWithTypeTemplate(postContent: string, templateJson: string | null | undefined): string {
  if (!templateJson) return postContent;

  let template: ParsedContent;
  let post: ParsedContent;
  try {
    template = JSON.parse(templateJson);
    post = JSON.parse(postContent);
  } catch {
    return postContent;
  }
  if (!template?.blocks?.length) return postContent;
  const postBlocks = Array.isArray(post?.blocks) ? post.blocks : [];

  const { wrapped, replaced } = substitute(template.blocks, postBlocks);
  // No placeholder anywhere — append the post's blocks so the template can
  // still serve as a header/footer/wrapper.
  const finalBlocks = replaced ? wrapped : [...wrapped, ...postBlocks];

  return JSON.stringify({ blocks: finalBlocks, version: post.version || template.version || '1.0' });
}

interface SubstituteResult { wrapped: BlockLike[]; replaced: boolean }

function substitute(templateBlocks: BlockLike[], postBlocks: BlockLike[]): SubstituteResult {
  const out: BlockLike[] = [];
  let replaced = false;
  for (const block of templateBlocks) {
    if (block?.type === POST_CONTENT_TYPE) {
      out.push(...postBlocks);
      replaced = true;
      continue;
    }
    let next = block;
    if (Array.isArray(block?.blocks)) {
      const r = substitute(block.blocks, postBlocks);
      if (r.replaced) replaced = true;
      next = { ...next, blocks: r.wrapped };
    }
    if (Array.isArray(block?.columns)) {
      const newCols = block.columns.map(col => {
        if (!Array.isArray(col?.blocks)) return col;
        const r = substitute(col.blocks, postBlocks);
        if (r.replaced) replaced = true;
        return { ...col, blocks: r.wrapped };
      });
      next = { ...next, columns: newCols };
    }
    out.push(next);
  }
  return { wrapped: out, replaced };
}
