/**
 * Per-block-type unit tests for `renderBlocksToEmailHtml`.
 *
 * Sister file to `email-render-blocks.test.ts`, which covers the high-level
 * tree-walking + escape contract. This file drills into each block renderer's
 * branches — size/alignment/variant matrices and optional-field combinations
 * — which were flagged as gaps in `.planning/coverage-baseline-2026-05-08.md`.
 *
 * Assertions are deliberately specific to the renderer's current inline-style
 * output (font-size, padding, color literals). If the renderer changes
 * those defaults, these tests are meant to fail loudly so the change is
 * intentional.
 */
import { describe, it, expect } from 'vitest';
import { renderBlocksToEmailHtml } from '@/lib/email/render-blocks-to-email';
import type {
  Block,
  TextBlock,
  HeadingBlock,
  ImageBlock,
  ButtonBlock,
  SpacerBlock,
  DividerBlock,
  ColumnsBlock,
  QuoteBlock,
  SectionBlock,
  SocialLinksBlock,
  EmailHeaderBlock,
  EmailFooterBlock,
} from '@/types/blocks';

const renderOne = (b: Block): string => renderBlocksToEmailHtml([b]);

describe('renderText (size + alignment + html-detect + style merge)', () => {
  it.each([
    ['sm', '14px'],
    ['base', '16px'],
    ['lg', '18px'],
    ['xl', '20px'],
  ] as const)('size=%s emits font-size:%s', (size, px) => {
    const b: TextBlock = { id: 't', type: 'text', order: 0, content: 'x', size };
    expect(renderOne(b)).toContain(`font-size:${px}`);
  });

  it('defaults to base (16px) when size is omitted', () => {
    const b: TextBlock = { id: 't', type: 'text', order: 0, content: 'x' };
    expect(renderOne(b)).toContain('font-size:16px');
  });

  it.each(['left', 'center', 'right'] as const)('alignment=%s emits text-align:%s', (align) => {
    const b: TextBlock = { id: 't', type: 'text', order: 0, content: 'x', alignment: align };
    expect(renderOne(b)).toContain(`text-align:${align}`);
  });

  it('wraps plain content in <p> and escapes special chars', () => {
    const b: TextBlock = { id: 't', type: 'text', order: 0, content: 'a & b' };
    const html = renderOne(b);
    expect(html).toMatch(/^<p style="/);
    expect(html).toContain('a &amp; b');
  });

  it('wraps HTML-looking content in <div> and does not escape it', () => {
    const b: TextBlock = {
      id: 't',
      type: 'text',
      order: 0,
      content: '<strong>bold</strong>',
    };
    const html = renderOne(b);
    expect(html).toMatch(/^<div style="/);
    expect(html).toContain('<strong>bold</strong>');
  });

  it('merges block.style into the inline style attribute', () => {
    const b: TextBlock = {
      id: 't',
      type: 'text',
      order: 0,
      content: 'x',
      style: { color: '#abc123', fontWeight: '700' },
    };
    const html = renderOne(b);
    expect(html).toContain('color:#abc123');
    expect(html).toContain('font-weight:700');
  });
});

describe('renderHeading (levels 1-6 + html-detect)', () => {
  it.each([
    [1, 'h1', '32px'],
    [2, 'h2', '28px'],
    [3, 'h3', '24px'],
    [4, 'h4', '20px'],
    [5, 'h5', '18px'],
    [6, 'h6', '16px'],
  ] as const)('level=%s emits <%s> at %s', (level, tag, px) => {
    const b: HeadingBlock = {
      id: 'h',
      type: 'heading',
      order: 0,
      content: 'T',
      level: level as HeadingBlock['level'],
    };
    const html = renderOne(b);
    expect(html).toMatch(new RegExp(`^<${tag} style="`));
    expect(html).toContain(`font-size:${px}`);
  });

  it('does not escape HTML-looking heading content', () => {
    const b: HeadingBlock = {
      id: 'h',
      type: 'heading',
      order: 0,
      content: '<em>hi</em>',
      level: 1,
    };
    expect(renderOne(b)).toContain('<em>hi</em>');
  });

  it('escapes plain heading content', () => {
    const b: HeadingBlock = {
      id: 'h',
      type: 'heading',
      order: 0,
      content: 'A < B',
      level: 2,
    };
    expect(renderOne(b)).toContain('A &lt; B');
  });
});

describe('renderImage (width + alignment + caption)', () => {
  it.each([
    ['full', '100%'],
    ['large', '520px'],
    ['medium', '400px'],
    ['small', '280px'],
  ] as const)('width=%s renders width:%s', (width, css) => {
    const b: ImageBlock = {
      id: 'i',
      type: 'image',
      order: 0,
      url: 'https://x.test/a.png',
      alt: 'alt',
      width,
    };
    const html = renderOne(b);
    expect(html).toContain(`width:${css}`);
    // width attribute strips the px suffix per the renderer
    expect(html).toContain(`width="${css.replace('px', '')}"`);
  });

  it('defaults to full width when width is omitted', () => {
    const b: ImageBlock = {
      id: 'i',
      type: 'image',
      order: 0,
      url: 'https://x.test/a.png',
      alt: 'a',
    };
    expect(renderOne(b)).toContain('width:100%');
  });

  it.each(['left', 'center', 'right'] as const)('alignment=%s wrapper text-align:%s', (align) => {
    const b: ImageBlock = {
      id: 'i',
      type: 'image',
      order: 0,
      url: 'https://x.test/a.png',
      alt: 'a',
      alignment: align,
    };
    expect(renderOne(b)).toContain(`text-align:${align}`);
  });

  it('renders caption paragraph when caption present', () => {
    const b: ImageBlock = {
      id: 'i',
      type: 'image',
      order: 0,
      url: 'https://x.test/a.png',
      alt: 'a',
      caption: 'A caption',
    };
    const html = renderOne(b);
    expect(html).toContain('A caption');
    expect(html).toContain('color:#666666'); // caption color
  });

  it('omits caption paragraph when caption absent', () => {
    const b: ImageBlock = {
      id: 'i',
      type: 'image',
      order: 0,
      url: 'https://x.test/a.png',
      alt: 'a',
    };
    expect(renderOne(b)).not.toContain('color:#666666');
  });

  it('escapes special characters in url and alt', () => {
    const b: ImageBlock = {
      id: 'i',
      type: 'image',
      order: 0,
      url: 'https://x.test/a.png?a=1&b=2',
      alt: 'Bob & Alice',
    };
    const html = renderOne(b);
    expect(html).toContain('a=1&amp;b=2');
    expect(html).toContain('Bob &amp; Alice');
  });
});

describe('renderButton (size + variant + style + openInNewTab)', () => {
  it.each([
    ['sm', '14px', '20px', '8px'],
    ['md', '16px', '28px', '12px'],
    ['lg', '18px', '36px', '16px'],
  ] as const)('size=%s emits font-size:%s and padding:%s %s', (size, fs, px, py) => {
    const b: ButtonBlock = {
      id: 'b',
      type: 'button',
      order: 0,
      text: 'Go',
      url: 'https://x.test',
      size,
    };
    const html = renderOne(b);
    expect(html).toContain(`font-size:${fs}`);
    expect(html).toContain(`padding:${py} ${px}`);
  });

  it('primary variant (default) uses blue bg + white text', () => {
    const b: ButtonBlock = {
      id: 'b',
      type: 'button',
      order: 0,
      text: 'Go',
      url: 'https://x.test',
    };
    const html = renderOne(b);
    expect(html).toContain('background-color:#2563eb');
    expect(html).toContain('color:#ffffff');
  });

  it('outline variant uses white bg + blue text', () => {
    const b: ButtonBlock = {
      id: 'b',
      type: 'button',
      order: 0,
      text: 'Go',
      url: 'https://x.test',
      variant: 'outline',
    };
    const html = renderOne(b);
    expect(html).toContain('background-color:#ffffff');
    expect(html).toContain('color:#2563eb');
  });

  it('secondary variant uses white bg + blue text', () => {
    const b: ButtonBlock = {
      id: 'b',
      type: 'button',
      order: 0,
      text: 'Go',
      url: 'https://x.test',
      variant: 'secondary',
    };
    const html = renderOne(b);
    expect(html).toContain('background-color:#ffffff');
    expect(html).toContain('color:#2563eb');
  });

  it('block.style overrides default colors', () => {
    const b: ButtonBlock = {
      id: 'b',
      type: 'button',
      order: 0,
      text: 'Go',
      url: 'https://x.test',
      style: {
        backgroundColor: '#111111',
        color: '#eeeeee',
        borderColor: '#222222',
        borderRadius: '0px',
      },
    };
    const html = renderOne(b);
    expect(html).toContain('background-color:#111111');
    expect(html).toContain('color:#eeeeee');
    expect(html).toContain('border:1px solid #222222');
    expect(html).toContain('border-radius:0px');
  });

  it('adds target="_blank" when openInNewTab is true', () => {
    const b: ButtonBlock = {
      id: 'b',
      type: 'button',
      order: 0,
      text: 'Go',
      url: 'https://x.test',
      openInNewTab: true,
    };
    expect(renderOne(b)).toContain('target="_blank"');
  });

  it('omits target when openInNewTab is falsy', () => {
    const b: ButtonBlock = {
      id: 'b',
      type: 'button',
      order: 0,
      text: 'Go',
      url: 'https://x.test',
    };
    expect(renderOne(b)).not.toContain('target="_blank"');
  });

  it('escapes special characters in url and text', () => {
    const b: ButtonBlock = {
      id: 'b',
      type: 'button',
      order: 0,
      text: 'Buy & Save',
      url: 'https://x.test?a=1&b=2',
    };
    const html = renderOne(b);
    expect(html).toContain('Buy &amp; Save');
    expect(html).toContain('a=1&amp;b=2');
  });
});

describe('renderSpacer (all height variants)', () => {
  it.each([
    ['sm', '16px'],
    ['md', '32px'],
    ['lg', '48px'],
    ['xl', '64px'],
  ] as const)('height=%s emits %s', (h, px) => {
    const b: SpacerBlock = { id: 's', type: 'spacer', order: 0, height: h };
    const html = renderOne(b);
    expect(html).toContain(`height:${px}`);
    expect(html).toContain(`line-height:${px}`);
  });
});

describe('renderDivider (line style + color)', () => {
  it.each(['solid', 'dashed', 'dotted'] as const)('lineStyle=%s', (ls) => {
    const b: DividerBlock = { id: 'd', type: 'divider', order: 0, lineStyle: ls };
    expect(renderOne(b)).toContain(`border-top:1px ${ls}`);
  });

  it('defaults to solid when lineStyle is omitted', () => {
    const b: DividerBlock = { id: 'd', type: 'divider', order: 0 };
    expect(renderOne(b)).toContain('border-top:1px solid');
  });

  it('uses block.style.borderColor when provided', () => {
    const b: DividerBlock = {
      id: 'd',
      type: 'divider',
      order: 0,
      style: { borderColor: '#ff00ff' },
    };
    expect(renderOne(b)).toContain('#ff00ff');
  });

  it('falls back to default border color when style omitted', () => {
    const b: DividerBlock = { id: 'd', type: 'divider', order: 0 };
    expect(renderOne(b)).toContain('#e5e7eb');
  });
});

describe('renderColumns (empty + gap + padding + valign + bg)', () => {
  it('returns empty string when columns array is empty', () => {
    const b: ColumnsBlock = { id: 'c', type: 'columns', order: 0, columns: [] };
    expect(renderOne(b)).toBe('');
  });

  it('renders a single column with numeric width', () => {
    const b: ColumnsBlock = {
      id: 'c',
      type: 'columns',
      order: 0,
      columns: [
        {
          id: 'col-1',
          width: 100,
          blocks: [{ id: 'h', type: 'heading', order: 0, content: 'Only', level: 2 }],
        },
      ],
    };
    const html = renderOne(b);
    expect(html).toContain('Only');
    // 100% of 520px content area = 520px
    expect(html).toContain('max-width:520px');
  });

  it('renders multiple columns, splitting width evenly when width is non-numeric', () => {
    const b: ColumnsBlock = {
      id: 'c',
      type: 'columns',
      order: 0,
      columns: [
        { id: '1', width: '', blocks: [] },
        { id: '2', width: '', blocks: [] },
      ],
    };
    const html = renderOne(b);
    // 100/2 = 50% → Math.floor(520 * 50 / 100) = 260
    expect(html).toContain('max-width:260px');
  });

  it.each([
    ['sm', 8],
    ['md', 16],
    ['lg', 24],
  ] as const)('gap=%s inserts %dpx spacer between columns (MSO)', (gap, px) => {
    const b: ColumnsBlock = {
      id: 'c',
      type: 'columns',
      order: 0,
      gap,
      columns: [
        { id: '1', width: 50, blocks: [] },
        { id: '2', width: 50, blocks: [] },
      ],
    };
    expect(renderOne(b)).toContain(`<td width="${px}"></td>`);
  });

  it.each([
    ['none', '0'],
    ['sm', '8px'],
    ['md', '16px'],
    ['lg', '24px'],
  ] as const)('column padding=%s emits %s', (pad, css) => {
    const b: ColumnsBlock = {
      id: 'c',
      type: 'columns',
      order: 0,
      columns: [{ id: '1', width: 100, blocks: [], padding: pad }],
    };
    expect(renderOne(b)).toContain(`padding:${css}`);
  });

  it.each([
    ['top', 'top'],
    ['center', 'middle'],
    ['bottom', 'bottom'],
  ] as const)('column verticalAlign=%s renders valign="%s" (MSO)', (va, valign) => {
    const b: ColumnsBlock = {
      id: 'c',
      type: 'columns',
      order: 0,
      columns: [{ id: '1', width: 100, blocks: [], verticalAlign: va }],
    };
    expect(renderOne(b)).toContain(`valign="${valign}"`);
  });

  it('applies per-column backgroundColor', () => {
    const b: ColumnsBlock = {
      id: 'c',
      type: 'columns',
      order: 0,
      columns: [{ id: '1', width: 100, blocks: [], backgroundColor: '#fafafa' }],
    };
    expect(renderOne(b)).toContain('background-color:#fafafa');
  });

  it('renders nested block content inside columns', () => {
    const b: ColumnsBlock = {
      id: 'c',
      type: 'columns',
      order: 0,
      columns: [
        {
          id: '1',
          width: 100,
          blocks: [
            { id: 'inner', type: 'text', order: 0, content: 'NESTED' },
          ],
        },
      ],
    };
    expect(renderOne(b)).toContain('NESTED');
  });
});

describe('renderQuote (author + content type + custom colors)', () => {
  it('renders plain quote content (escaped) without author', () => {
    const b: QuoteBlock = {
      id: 'q',
      type: 'quote',
      order: 0,
      content: '< a quote >',
    };
    const html = renderOne(b);
    expect(html).toContain('&lt; a quote &gt;');
    // The em-dash author line should not appear
    expect(html).not.toContain('&mdash;');
  });

  it('renders author with em-dash when provided', () => {
    const b: QuoteBlock = {
      id: 'q',
      type: 'quote',
      order: 0,
      content: 'Quote text',
      author: 'A & B',
    };
    const html = renderOne(b);
    expect(html).toContain('&mdash;');
    expect(html).toContain('A &amp; B');
  });

  it('renders HTML quote content without escaping', () => {
    const b: QuoteBlock = {
      id: 'q',
      type: 'quote',
      order: 0,
      content: '<em>fancy</em>',
    };
    expect(renderOne(b)).toContain('<em>fancy</em>');
  });

  it('honors style overrides for border + background + text colors', () => {
    const b: QuoteBlock = {
      id: 'q',
      type: 'quote',
      order: 0,
      content: 'X',
      style: {
        borderColor: '#aa0000',
        backgroundColor: '#fff8e1',
        color: '#111111',
      },
    };
    const html = renderOne(b);
    expect(html).toContain('background-color:#aa0000'); // 4px border bar
    expect(html).toContain('background-color:#fff8e1'); // body bg
    expect(html).toContain('color:#111111');
  });

  it('falls back to default colors when style omitted', () => {
    const b: QuoteBlock = { id: 'q', type: 'quote', order: 0, content: 'X' };
    const html = renderOne(b);
    expect(html).toContain('#2563eb'); // default border
    expect(html).toContain('#f8fafc'); // default body bg
  });
});

describe('renderSection (bg + padding + bg image)', () => {
  it('uses block.backgroundColor (preferred) over style.backgroundColor', () => {
    const b: SectionBlock = {
      id: 's',
      type: 'section',
      order: 0,
      blocks: [],
      backgroundColor: '#aabbcc',
      style: { backgroundColor: '#ffffff' },
    };
    const html = renderOne(b);
    expect(html).toContain('background-color:#aabbcc');
    expect(html).not.toContain('background-color:#ffffff');
  });

  it('falls back to style.backgroundColor when block.backgroundColor is missing', () => {
    const b: SectionBlock = {
      id: 's',
      type: 'section',
      order: 0,
      blocks: [],
      style: { backgroundColor: '#ffffff' },
    };
    expect(renderOne(b)).toContain('background-color:#ffffff');
  });

  it('uses default 24px padding when not provided', () => {
    const b: SectionBlock = { id: 's', type: 'section', order: 0, blocks: [] };
    expect(renderOne(b)).toContain('padding:24px 0 24px 0');
  });

  it('honors custom paddingTop/Right/Bottom/Left', () => {
    const b: SectionBlock = {
      id: 's',
      type: 'section',
      order: 0,
      blocks: [],
      paddingTop: '8px',
      paddingRight: '12px',
      paddingBottom: '16px',
      paddingLeft: '20px',
    };
    expect(renderOne(b)).toContain('padding:8px 12px 16px 20px');
  });

  it('renders backgroundImage with default size + position', () => {
    const b: SectionBlock = {
      id: 's',
      type: 'section',
      order: 0,
      blocks: [],
      backgroundImage: 'https://x.test/bg.jpg',
    };
    const html = renderOne(b);
    expect(html).toContain("background-image:url('https://x.test/bg.jpg')");
    expect(html).toContain('background-size:cover');
    expect(html).toContain('background-position:center');
  });

  it('overrides backgroundSize and position when provided', () => {
    const b: SectionBlock = {
      id: 's',
      type: 'section',
      order: 0,
      blocks: [],
      backgroundImage: 'https://x.test/bg.jpg',
      backgroundSize: 'contain',
      backgroundPosition: 'top left',
    };
    const html = renderOne(b);
    expect(html).toContain('background-size:contain');
    expect(html).toContain('background-position:top left');
  });

  it('renders inner blocks inside the section', () => {
    const b: SectionBlock = {
      id: 's',
      type: 'section',
      order: 0,
      blocks: [{ id: 'inner', type: 'text', order: 0, content: 'inside-section' }],
    };
    expect(renderOne(b)).toContain('inside-section');
  });
});

describe('renderSocialLinks (platforms + iconSize + alignment)', () => {
  it.each([
    ['facebook', 'Facebook'],
    ['twitter', 'X (Twitter)'],
    ['instagram', 'Instagram'],
    ['linkedin', 'LinkedIn'],
    ['youtube', 'YouTube'],
    ['tiktok', 'TikTok'],
  ] as const)('platform=%s renders friendly label %s', (platform, label) => {
    const b: SocialLinksBlock = {
      id: 'sl',
      type: 'social-links',
      order: 0,
      links: [{ platform: platform as SocialLinksBlock['links'][number]['platform'], url: 'https://x.test' }],
    };
    expect(renderOne(b)).toContain(`>${label}</a>`);
  });

  it('uses larger font-size (15px) when iconSize > 32', () => {
    const b: SocialLinksBlock = {
      id: 'sl',
      type: 'social-links',
      order: 0,
      iconSize: 40,
      links: [{ platform: 'facebook', url: 'https://x.test' }],
    };
    expect(renderOne(b)).toContain('font-size:15px');
  });

  it('uses smaller font-size (13px) when iconSize <= 32', () => {
    const b: SocialLinksBlock = {
      id: 'sl',
      type: 'social-links',
      order: 0,
      iconSize: 24,
      links: [{ platform: 'facebook', url: 'https://x.test' }],
    };
    expect(renderOne(b)).toContain('font-size:13px');
  });

  it.each(['left', 'center', 'right'] as const)('alignment=%s emits text-align:%s', (align) => {
    const b: SocialLinksBlock = {
      id: 'sl',
      type: 'social-links',
      order: 0,
      alignment: align,
      links: [],
    };
    expect(renderOne(b)).toContain(`text-align:${align}`);
  });

  it('renders an empty wrapper when no links are provided', () => {
    const b: SocialLinksBlock = {
      id: 'sl',
      type: 'social-links',
      order: 0,
      links: [],
    };
    const html = renderOne(b);
    expect(html).toContain('text-align:center');
    expect(html).not.toContain('<a ');
  });

  it('escapes the URL on each link', () => {
    const b: SocialLinksBlock = {
      id: 'sl',
      type: 'social-links',
      order: 0,
      links: [{ platform: 'facebook', url: 'https://x.test/?a=1&b=2' }],
    };
    expect(renderOne(b)).toContain('a=1&amp;b=2');
  });
});

describe('renderEmailHeader (logo + tagline + alignment)', () => {
  it('renders default logo width 150 when logoWidth omitted', () => {
    const b: EmailHeaderBlock = {
      id: 'eh',
      type: 'email-header',
      order: 0,
      logoUrl: 'https://x.test/l.png',
    };
    expect(renderOne(b)).toContain('width="150"');
  });

  it('omits the logo entirely when logoUrl is missing', () => {
    const b: EmailHeaderBlock = {
      id: 'eh',
      type: 'email-header',
      order: 0,
      tagline: 'Tag only',
    };
    const html = renderOne(b);
    expect(html).not.toContain('<img');
    expect(html).toContain('Tag only');
  });

  it('omits the tagline paragraph when tagline is missing', () => {
    const b: EmailHeaderBlock = {
      id: 'eh',
      type: 'email-header',
      order: 0,
      logoUrl: 'https://x.test/l.png',
    };
    const html = renderOne(b);
    expect(html).toContain('<img');
    expect(html).not.toMatch(/<p[^>]*>[^<]+<\/p>/);
  });

  it('left alignment renders logo inline-block (no auto margins)', () => {
    const b: EmailHeaderBlock = {
      id: 'eh',
      type: 'email-header',
      order: 0,
      logoUrl: 'https://x.test/l.png',
      alignment: 'left',
    };
    const html = renderOne(b);
    expect(html).toContain('display:inline-block');
    expect(html).not.toContain('margin:0 auto');
  });

  it('center alignment renders logo block + auto margins', () => {
    const b: EmailHeaderBlock = {
      id: 'eh',
      type: 'email-header',
      order: 0,
      logoUrl: 'https://x.test/l.png',
      alignment: 'center',
    };
    const html = renderOne(b);
    expect(html).toContain('display:block');
    expect(html).toContain('margin:0 auto');
  });
});

describe('renderEmailFooter (companyName + address + socialLinks + showUnsubscribe)', () => {
  it('omits companyName paragraph when missing', () => {
    const b: EmailFooterBlock = { id: 'ef', type: 'email-footer', order: 0 };
    expect(renderOne(b)).not.toMatch(/font-weight:600/);
  });

  it('omits address paragraph when missing', () => {
    const b: EmailFooterBlock = { id: 'ef', type: 'email-footer', order: 0 };
    // The 12px color:#999999 line is only emitted with address (or unsub which is default-on).
    // Make a tighter assertion: address-text 'color:#999999' attached to the address copy is absent.
    expect(renderOne(b)).not.toMatch(/<p[^>]*color:#999999[^>]*>[^<]*[A-Za-z][^<]*<\/p>/);
  });

  it('renders social links separated by pipes', () => {
    const b: EmailFooterBlock = {
      id: 'ef',
      type: 'email-footer',
      order: 0,
      socialLinks: [
        { platform: 'twitter', url: 'https://x.test/t' },
        { platform: 'linkedin', url: 'https://x.test/l' },
      ],
    };
    const html = renderOne(b);
    expect(html).toContain('twitter');
    expect(html).toContain('linkedin');
    expect(html).toContain(' | ');
  });

  it('hides unsubscribe block when showUnsubscribe is explicitly false', () => {
    const b: EmailFooterBlock = {
      id: 'ef',
      type: 'email-footer',
      order: 0,
      showUnsubscribe: false,
    };
    const html = renderOne(b);
    expect(html).not.toContain('{{UNSUBSCRIBE_URL}}');
    expect(html).not.toContain('Unsubscribe');
  });

  it('shows unsubscribe block by default (undefined / true)', () => {
    const b: EmailFooterBlock = { id: 'ef', type: 'email-footer', order: 0 };
    expect(renderOne(b)).toContain('{{UNSUBSCRIBE_URL}}');
  });
});
