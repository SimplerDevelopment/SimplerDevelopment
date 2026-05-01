'use client';

import { PostContentBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface Props {
  block: PostContentBlock;
}

/**
 * Visible-in-editor placeholder for the `post-content` block type. In
 * production rendering, `wrapWithTypeTemplate()` substitutes this block with
 * the post's own blocks before render — so this only shows up inside the
 * template editor's iframe (where the substitution hasn't happened) and lets
 * the author see + select + reposition the slot.
 *
 * Layout strategy:
 *  - The outer `BlockStyleWrapper` (drawn upstream by the renderer) owns
 *    block.style: bg / border / margin / padding / radius / etc. Don't add
 *    intrinsic Tailwind values for those properties or they'll mask Style-tab
 *    changes — set padding=40 and the user must visibly see padding=40, not
 *    "padding=40 + my own px-6".
 *  - We DO apply `combineResponsiveClasses` for responsive padding/margin/
 *    visibility/typography here, mirroring what other block renderers do —
 *    BlockStyleWrapper deliberately skips the static `style.padding/margin`
 *    when responsive equivalents are set, expecting the renderer to handle
 *    them. If we didn't, responsive Style-tab values were getting silently
 *    dropped.
 *  - Visual ornament (icon, label, dashed accent column) is kept intentionally
 *    minimal so the placeholder is unmistakable in the editor without
 *    competing with the user's chosen styling.
 */
export function PostContentPlaceholderRender({ block }: Props) {
  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility
      )
    : '';

  return (
    <div className={responsiveClasses}>
      <div className="relative flex items-stretch min-h-[64px]">
        {/* Striped accent — clearly identifies the placeholder slot without
            adding margin/padding/border on the block itself. */}
        <div
          aria-hidden="true"
          className="w-1 rounded-l shrink-0 bg-[repeating-linear-gradient(45deg,_rgb(99_102_241_/_0.45)_0_6px,_transparent_6px_12px)]"
        />
        <div className="flex-1 flex items-center gap-3 py-3 px-4 bg-primary/[0.04]">
          <span className="material-icons text-primary/70 text-xl shrink-0">article</span>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider font-semibold text-foreground/80">
              Post Content
            </div>
            <div className="text-xs text-muted-foreground truncate">
              Each post’s own blocks render here at runtime. (Editor-only — substituted with the post body in production.)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
