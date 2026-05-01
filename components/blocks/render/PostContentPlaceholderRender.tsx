'use client';

/**
 * Visible-in-editor placeholder for the `post-content` block type. In
 * production rendering, `wrapWithTypeTemplate()` substitutes this block with
 * the post's own blocks before render — so this only shows up inside the
 * template editor's iframe (where the substitution hasn't happened) and lets
 * the author see + select + reposition the slot.
 *
 * Intrinsic styling here is deliberately minimal: any `bg`, `border`,
 * `padding`, `margin`, `borderRadius`, etc. set on the block via the Style
 * tab is applied by `BlockStyleWrapper` on an outer wrapper div, and any
 * intrinsic Tailwind values here would silently mask the user's choice. The
 * editor chrome (hover dashed outline / selection blue outline drawn by
 * `SelectableBlock`) is enough to identify the slot.
 */
export function PostContentPlaceholderRender() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="material-icons text-base">article</span>
      <span className="text-xs uppercase tracking-wider font-semibold">Post Content</span>
      <span className="text-xs">— each post’s own blocks render here at runtime.</span>
    </div>
  );
}
