'use client';

/**
 * Visible-in-editor placeholder for the `post-content` block type. In
 * production rendering, `wrapWithTypeTemplate()` substitutes this block with
 * the post's own blocks before render — so this only shows up inside the
 * template editor's iframe (where the substitution hasn't happened) and lets
 * the author see + select + reposition the slot.
 */
export function PostContentPlaceholderRender() {
  return (
    <div className="my-6 mx-auto max-w-4xl px-6 py-8 border-2 border-dashed border-primary/40 bg-primary/5 rounded-xl text-center">
      <span className="material-icons text-primary/70 text-4xl">article</span>
      <div className="mt-2 text-sm font-semibold text-foreground">Post Content</div>
      <div className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
        Each post’s own blocks render here at runtime. This placeholder only appears in the template editor.
      </div>
    </div>
  );
}
