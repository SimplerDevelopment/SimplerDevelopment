import type { Block } from '@/types/blocks';

/**
 * Branding data extracted from a branding profile for email template application.
 */
export interface EmailBranding {
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  backgroundColor?: string;
  headingFont?: string;
  bodyFont?: string;
  logoUrl?: string;
  logoAlt?: string;
  borderRadius?: string;
  buttonPrimaryBg?: string;
  buttonPrimaryText?: string;
  companyName?: string;
}

/**
 * Apply branding profile styles to email template blocks.
 * - Sets logo in email-header blocks
 * - Applies primary color to buttons
 * - Applies text color to headings
 * - Sets company name in email-footer blocks
 * - Applies font families where present
 */
export function applyBrandingToBlocks(blocks: Block[], branding: EmailBranding): Block[] {
  return blocks.map((block): Block => {
    switch (block.type) {
      case 'email-header': {
        const updates: Record<string, unknown> = {};
        if (branding.logoUrl) updates.logoUrl = branding.logoUrl;
        return { ...block, ...updates };
      }

      case 'email-footer': {
        const updates: Record<string, unknown> = {};
        if (branding.companyName) updates.companyName = branding.companyName;
        return { ...block, ...updates };
      }

      case 'heading': {
        const style = { ...block.style };
        if (branding.textColor) style.color = branding.textColor;
        if (branding.headingFont) style.fontFamily = branding.headingFont;
        return { ...block, style };
      }

      case 'text': {
        const style = { ...block.style };
        if (branding.bodyFont) style.fontFamily = branding.bodyFont;
        return { ...block, style };
      }

      case 'button': {
        const style = { ...block.style };
        if (branding.buttonPrimaryBg || branding.primaryColor) {
          style.backgroundColor = branding.buttonPrimaryBg ?? branding.primaryColor;
        }
        if (branding.buttonPrimaryText) {
          style.color = branding.buttonPrimaryText;
        }
        if (branding.borderRadius) {
          style.borderRadius = branding.borderRadius;
        }
        return { ...block, style };
      }

      case 'divider': {
        const style = { ...block.style };
        if (branding.accentColor) style.borderColor = branding.accentColor;
        return { ...block, style };
      }

      case 'quote': {
        const style = { ...block.style };
        if (branding.primaryColor) style.borderColor = branding.primaryColor;
        return { ...block, style };
      }

      case 'columns':
      case 'section': {
        if ('blocks' in block && Array.isArray(block.blocks)) {
          return { ...block, blocks: applyBrandingToBlocks(block.blocks, branding) };
        }
        if ('columns' in block && Array.isArray(block.columns)) {
          return {
            ...block,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            columns: block.columns.map((col: any) => ({
              ...col,
              blocks: applyBrandingToBlocks(col.blocks, branding),
            })),
          } as Block;
        }
        return block;
      }

      default:
        return block;
    }
  });
}

/**
 * Extract EmailBranding from a branding profile DB row.
 */
export function brandingProfileToEmailBranding(
  profile: {
    primaryColor?: string | null;
    accentColor?: string | null;
    textColor?: string | null;
    backgroundColor?: string | null;
    headingFont?: string | null;
    bodyFont?: string | null;
    logoUrl?: string | null;
    logoAlt?: string | null;
    borderRadius?: string | null;
    buttonStyle?: { primaryBg?: string; primaryText?: string } | null;
  },
  companyName?: string,
): EmailBranding {
  return {
    primaryColor: profile.primaryColor ?? undefined,
    accentColor: profile.accentColor ?? undefined,
    textColor: profile.textColor ?? undefined,
    backgroundColor: profile.backgroundColor ?? undefined,
    headingFont: profile.headingFont ?? undefined,
    bodyFont: profile.bodyFont ?? undefined,
    logoUrl: profile.logoUrl ?? undefined,
    logoAlt: profile.logoAlt ?? undefined,
    borderRadius: profile.borderRadius ?? undefined,
    buttonPrimaryBg: profile.buttonStyle?.primaryBg ?? undefined,
    buttonPrimaryText: profile.buttonStyle?.primaryText ?? undefined,
    companyName,
  };
}
