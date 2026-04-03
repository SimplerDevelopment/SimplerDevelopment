import type {
  Block,
  BlockStyle,
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

/**
 * Converts Block[] to email-safe HTML (table-based, inline styles).
 * Output is the inner content — wrap with buildCampaignHtml() for full document.
 */
export function renderBlocksToEmailHtml(blocks: Block[]): string {
  return blocks.map(renderBlock).join('\n');
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'text': return renderText(block);
    case 'heading': return renderHeading(block);
    case 'image': return renderImage(block);
    case 'button': return renderButton(block);
    case 'spacer': return renderSpacer(block);
    case 'divider': return renderDivider(block);
    case 'columns': return renderColumns(block);
    case 'quote': return renderQuote(block);
    case 'section': return renderSection(block);
    case 'social-links': return renderSocialLinks(block);
    case 'email-header': return renderEmailHeader(block);
    case 'email-footer': return renderEmailFooter(block);
    default: return '';
  }
}

// -- Style helpers --

function emailStyles(style?: BlockStyle): string {
  if (!style) return '';
  const map: Record<string, string | undefined> = {
    'color': style.color,
    'background-color': style.backgroundColor,
    'font-size': style.fontSize,
    'font-weight': style.fontWeight,
    'font-family': style.fontFamily,
    'line-height': style.lineHeight,
    'letter-spacing': style.letterSpacing,
    'text-align': style.textAlign,
    'text-decoration': style.textDecoration,
    'text-transform': style.textTransform,
    'padding': style.padding,
    'margin': style.margin,
    'border-radius': style.borderRadius,
    'border-width': style.borderWidth,
    'border-color': style.borderColor,
    'border-style': style.borderStyle,
    'opacity': style.opacity,
  };
  return Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

function mergeStyle(base: string, extra: string): string {
  const parts = [base, extra].filter(Boolean);
  return parts.join(';');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Check if content looks like HTML (has tags) — if so, render as-is; otherwise wrap in <p> */
function isHtmlContent(content: string): boolean {
  return /<[a-zA-Z][\s\S]*>/.test(content);
}

// -- Block renderers --

function renderText(block: TextBlock): string {
  const align = block.alignment ?? 'left';
  const sizeMap: Record<string, string> = {
    sm: '14px', base: '16px', lg: '18px', xl: '20px',
  };
  const fontSize = sizeMap[block.size ?? 'base'];
  const base = `font-size:${fontSize};line-height:1.6;color:#333333;text-align:${align};margin:0 0 16px 0`;
  const style = mergeStyle(base, emailStyles(block.style));

  if (isHtmlContent(block.content)) {
    return `<div style="${style}">${block.content}</div>`;
  }
  return `<p style="${style}">${escapeHtml(block.content)}</p>`;
}

function renderHeading(block: HeadingBlock): string {
  const tag = `h${block.level}` as const;
  const align = block.alignment ?? 'left';
  const sizeMap: Record<number, string> = {
    1: '32px', 2: '28px', 3: '24px', 4: '20px', 5: '18px', 6: '16px',
  };
  const fontSize = sizeMap[block.level];
  const base = `font-size:${fontSize};font-weight:bold;line-height:1.3;color:#111111;text-align:${align};margin:0 0 16px 0`;
  const style = mergeStyle(base, emailStyles(block.style));

  const content = isHtmlContent(block.content) ? block.content : escapeHtml(block.content);
  return `<${tag} style="${style}">${content}</${tag}>`;
}

function renderImage(block: ImageBlock): string {
  const align = block.alignment ?? 'center';
  const widthMap: Record<string, string> = {
    full: '100%', large: '520px', medium: '400px', small: '280px',
  };
  const width = widthMap[block.width ?? 'full'];
  const alignMap: Record<string, string> = {
    left: 'left', center: 'center', right: 'right',
  };

  const imgStyle = `display:block;max-width:100%;width:${width};height:auto;border:0`;
  const wrapperStyle = `text-align:${alignMap[align]};margin:0 0 16px 0`;

  let html = `<div style="${wrapperStyle}">`;
  html += `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" width="${width.replace('px', '')}" style="${imgStyle}" />`;
  if (block.caption) {
    html += `<p style="font-size:13px;color:#666666;margin:8px 0 0 0;text-align:${alignMap[align]}">${escapeHtml(block.caption)}</p>`;
  }
  html += '</div>';
  return html;
}

function renderButton(block: ButtonBlock): string {
  const align = block.alignment ?? 'center';
  const sizeMap: Record<string, { px: string; py: string; fs: string }> = {
    sm: { px: '20px', py: '8px', fs: '14px' },
    md: { px: '28px', py: '12px', fs: '16px' },
    lg: { px: '36px', py: '16px', fs: '18px' },
  };
  const size = sizeMap[block.size ?? 'md'];

  const isPrimary = block.variant !== 'outline' && block.variant !== 'secondary';
  const bgColor = block.style?.backgroundColor ?? (isPrimary ? '#2563eb' : '#ffffff');
  const textColor = block.style?.color ?? (isPrimary ? '#ffffff' : '#2563eb');
  const borderColor = block.style?.borderColor ?? bgColor;
  const borderRadius = block.style?.borderRadius ?? '6px';

  // Table-based button for maximum email client compatibility
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}" style="margin:0 0 16px 0${align === 'center' ? ';margin-left:auto;margin-right:auto' : ''}">
  <tr>
    <td style="background-color:${bgColor};border-radius:${borderRadius};border:1px solid ${borderColor};text-align:center">
      <a href="${escapeHtml(block.url)}" style="display:inline-block;padding:${size.py} ${size.px};font-size:${size.fs};font-weight:600;color:${textColor};text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"${block.openInNewTab ? ' target="_blank"' : ''}>${escapeHtml(block.text)}</a>
    </td>
  </tr>
</table>`;
}

function renderSpacer(block: SpacerBlock): string {
  const heightMap: Record<string, string> = {
    sm: '16px', md: '32px', lg: '48px', xl: '64px',
  };
  const height = heightMap[block.height];
  return `<div style="height:${height};line-height:${height};font-size:1px">&nbsp;</div>`;
}

function renderDivider(block: DividerBlock): string {
  const lineStyle = block.lineStyle ?? 'solid';
  const color = block.style?.borderColor ?? '#e5e7eb';
  return `<hr style="border:0;border-top:1px ${lineStyle} ${color};margin:16px 0" />`;
}

function renderColumns(block: ColumnsBlock): string {
  const cols = block.columns;
  if (!cols || cols.length === 0) return '';

  // Outlook conditional comments for multi-column layout
  const totalWidth = 520; // content area (600 - 40px padding each side)
  const gap = block.gap === 'lg' ? 24 : block.gap === 'sm' ? 8 : 16;

  let html = '<!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>';

  cols.forEach((col, i) => {
    const pct = typeof col.width === 'number' ? col.width : parseInt(String(col.width)) || (100 / cols.length);
    const colWidth = Math.floor(totalWidth * pct / 100);
    const bgStyle = col.backgroundColor ? `background-color:${col.backgroundColor};` : '';
    const paddingMap: Record<string, string> = {
      none: '0', sm: '8px', md: '16px', lg: '24px',
    };
    const pad = paddingMap[col.padding ?? 'none'];
    const valignMap: Record<string, string> = {
      top: 'top', center: 'middle', bottom: 'bottom',
    };
    const valign = valignMap[col.verticalAlign ?? 'top'];

    html += `<!--[if mso]><td valign="${valign}" width="${colWidth}" style="${bgStyle}padding:${pad}"><![endif]-->`;
    html += `<div style="display:inline-block;vertical-align:${valign === 'middle' ? 'middle' : valign};width:100%;max-width:${colWidth}px;${bgStyle}padding:${pad}">`;

    if (col.blocks && col.blocks.length > 0) {
      html += col.blocks.map(renderBlock).join('\n');
    }

    html += '</div>';
    html += '<!--[if mso]></td>';
    if (i < cols.length - 1 && gap > 0) {
      html += `<td width="${gap}"></td>`;
    }
    html += '<![endif]-->';
  });

  html += '<!--[if mso]></tr></table><![endif]-->';
  return html;
}

function renderQuote(block: QuoteBlock): string {
  const borderColor = block.style?.borderColor ?? '#2563eb';
  const bgColor = block.style?.backgroundColor ?? '#f8fafc';
  const textColor = block.style?.color ?? '#333333';

  let html = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 16px 0">
  <tr>
    <td width="4" style="background-color:${borderColor}"></td>
    <td style="padding:16px 20px;background-color:${bgColor}">
      <p style="margin:0;font-style:italic;font-size:16px;line-height:1.6;color:${textColor}">${isHtmlContent(block.content) ? block.content : escapeHtml(block.content)}</p>`;

  if (block.author) {
    html += `\n      <p style="margin:8px 0 0 0;font-size:14px;color:#666666">&mdash; ${escapeHtml(block.author)}</p>`;
  }

  html += `\n    </td>
  </tr>
</table>`;
  return html;
}

function renderSection(block: SectionBlock): string {
  const bg = block.backgroundColor ?? block.style?.backgroundColor ?? '';
  const color = block.color ?? block.style?.color ?? '';
  const pt = block.paddingTop ?? '24px';
  const pb = block.paddingBottom ?? '24px';
  const pl = block.paddingLeft ?? '0';
  const pr = block.paddingRight ?? '0';

  let style = `padding:${pt} ${pr} ${pb} ${pl}`;
  if (bg) style += `;background-color:${bg}`;
  if (color) style += `;color:${color}`;
  if (block.backgroundImage) {
    style += `;background-image:url('${block.backgroundImage}');background-size:${block.backgroundSize ?? 'cover'};background-position:${block.backgroundPosition ?? 'center'}`;
  }

  const inner = block.blocks.map(renderBlock).join('\n');
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  <tr>
    <td style="${style}">
      ${inner}
    </td>
  </tr>
</table>`;
}

function renderSocialLinks(block: SocialLinksBlock): string {
  const size = block.iconSize ?? 32;
  const align = block.alignment ?? 'center';
  const links = block.links ?? [];

  // Use text-based links with platform names (most reliable across email clients)
  const platformLabels: Record<string, string> = {
    facebook: 'Facebook',
    twitter: 'X (Twitter)',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    youtube: 'YouTube',
    tiktok: 'TikTok',
  };

  const linkHtml = links
    .map(
      (l) =>
        `<a href="${escapeHtml(l.url)}" style="display:inline-block;padding:4px 12px;font-size:${size > 32 ? '15' : '13'}px;color:#555555;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" target="_blank">${platformLabels[l.platform] ?? l.platform}</a>`
    )
    .join(' ');

  return `<div style="text-align:${align};margin:0 0 16px 0">${linkHtml}</div>`;
}

function renderEmailHeader(block: EmailHeaderBlock): string {
  const align = block.alignment ?? 'center';
  let html = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px 0">
  <tr>
    <td style="text-align:${align};padding:0 0 16px 0">`;

  if (block.logoUrl) {
    const logoW = block.logoWidth ?? 150;
    html += `\n      <img src="${escapeHtml(block.logoUrl)}" alt="Logo" width="${logoW}" style="display:${align === 'center' ? 'block' : 'inline-block'};max-width:100%;height:auto;border:0${align === 'center' ? ';margin:0 auto' : ''}" />`;
  }

  if (block.tagline) {
    html += `\n      <p style="margin:8px 0 0 0;font-size:14px;color:#666666;text-align:${align}">${escapeHtml(block.tagline)}</p>`;
  }

  html += `\n    </td>
  </tr>
</table>`;
  return html;
}

function renderEmailFooter(block: EmailFooterBlock): string {
  const showUnsub = block.showUnsubscribe !== false;

  let html = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top:1px solid #e5e7eb;margin:24px 0 0 0">
  <tr>
    <td style="padding:24px 0;text-align:center">`;

  if (block.companyName) {
    html += `\n      <p style="margin:0 0 4px 0;font-size:13px;color:#666666;font-weight:600">${escapeHtml(block.companyName)}</p>`;
  }
  if (block.address) {
    html += `\n      <p style="margin:0 0 12px 0;font-size:12px;color:#999999">${escapeHtml(block.address)}</p>`;
  }

  if (block.socialLinks && block.socialLinks.length > 0) {
    const links = block.socialLinks
      .map(l => `<a href="${escapeHtml(l.url)}" style="color:#666666;text-decoration:none;padding:0 8px;font-size:12px" target="_blank">${escapeHtml(l.platform)}</a>`)
      .join(' | ');
    html += `\n      <p style="margin:0 0 12px 0">${links}</p>`;
  }

  if (showUnsub) {
    html += `\n      <p style="margin:0;font-size:12px;color:#999999">
        <a href="{{UNSUBSCRIBE_URL}}" style="color:#666666;text-decoration:underline">Unsubscribe</a>
      </p>`;
  }

  html += `\n    </td>
  </tr>
</table>`;
  return html;
}
