import { Breakpoint, ResponsiveSettings } from '../responsive';

export interface BlockStyle {
  backgroundColor?: string;
  color?: string;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  borderWidth?: string;
  borderColor?: string;
  borderStyle?: string;
  borderRadius?: string;
  // Per-side border overrides
  borderTopWidth?: string;
  borderTopColor?: string;
  borderTopStyle?: string;
  borderRightWidth?: string;
  borderRightColor?: string;
  borderRightStyle?: string;
  borderBottomWidth?: string;
  borderBottomColor?: string;
  borderBottomStyle?: string;
  borderLeftWidth?: string;
  borderLeftColor?: string;
  borderLeftStyle?: string;
  // Per-corner border radius
  borderTopLeftRadius?: string;
  borderTopRightRadius?: string;
  borderBottomLeftRadius?: string;
  borderBottomRightRadius?: string;
  padding?: string;
  margin?: string;
  // Per-side overrides. When both shorthand and a longhand are set, the
  // renderer prefers longhand for that side. The panel writes shorthand;
  // the visual editor's drag/resize handles can write longhand. Either is
  // also independently overridable per-breakpoint via block.responsive.
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  boxShadow?: string;
  opacity?: string;
  // Flex layout
  display?: 'block' | 'flex' | 'inline-flex' | 'grid' | 'inline-block' | 'none';
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  gap?: string;
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  // Dimensions
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
  // Overflow
  overflow?: 'visible' | 'hidden' | 'scroll' | 'auto';
  // Positioning
  position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: string;
  // Text
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  // Background
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundAttachment?: string;
  backgroundBlendMode?: string;
  backgroundGradient?: string;
  // Transitions
  transition?: string;
  // Grid layout
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridGap?: string;
  // Cursor
  cursor?: string;
  // Custom CSS (raw key:value pairs for anything not covered above)
  customCSS?: string;
}

export interface BaseBlock {
  id: string;
  type: string;
  order: number;
  label?: string;
  /** Anchor id for jump links (e.g. #about-us). Rendered as the block's DOM id. */
  anchor?: string;
  responsive?: ResponsiveSettings;
  style?: BlockStyle;
  /** Per-element styles for blocks with multiple visual elements */
  elementStyles?: Record<string, Partial<BlockStyle>>;
  /** Per-breakpoint layout style overrides (desktop-first). Layout properties
   *  (width, height, display, flex, grid, position, etc.) set here override the
   *  flat `style` object for the given breakpoint. Aesthetic properties (color,
   *  border, shadow) stay in `style` and are not breakpoint-aware. */
  responsiveStyle?: Partial<Record<Breakpoint, Partial<BlockStyle>>>;
  /** When true, block cannot be deleted in the editor */
  required?: boolean;
}

/**
 * Placeholder block used inside a content type's template. At render time
 * the post's own blocks are substituted in place of every PostContentBlock
 * found in the template tree. Has no fields of its own — it's a marker.
 */
export interface PostContentBlock extends BaseBlock {
  type: 'post-content';
}
