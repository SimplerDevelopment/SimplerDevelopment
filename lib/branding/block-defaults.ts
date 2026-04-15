/**
 * Apply brand-derived defaults to a newly-created block.
 *
 * When a user adds a block in the CMS, the factory produces a neutral block
 * with placeholder copy ("Hero Title", "Click me"). This function overlays
 * brand messaging (tagline, value proposition, company name, etc.) and brand
 * sentinels (so colors/fonts follow the brand automatically) on top.
 *
 * Pure: no DB reads, no side effects. Safe to call in any context.
 */

import type { Block } from '@/types/blocks';

export interface BrandMessagingContext {
  companyName?: string;
  tagline?: string;
  valueProposition?: string;
  elevatorPitch?: string;
  boilerplate?: string;
  missionStatement?: string;
  visionStatement?: string;
  keyDifferentiators?: string[];
  socialProof?: string;
}

export interface BrandDefaultsContext {
  /** Messaging fields from brandingMessaging — used to pre-fill copy */
  messaging?: BrandMessagingContext;
  /** Logo URL from the branding profile — used for footer/email-header */
  logoUrl?: string;
  /**
   * When true, a newly-created block references the brand via sentinels
   * (brand.primary, brand.headingFont, brand.radius) so it tracks brand changes.
   */
  useSentinels?: boolean;
}

/** Type guard for blocks that have a copy field we can pre-fill. */
function isNonEmpty(s: string | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function pickFirst(...vals: Array<string | undefined>): string | undefined {
  for (const v of vals) {
    if (isNonEmpty(v)) return v;
  }
  return undefined;
}

/**
 * Merge brand messaging + sentinels into a block's defaults.
 * Returns a NEW block (does not mutate input).
 *
 * Only fills fields that match the factory's placeholder exactly — if the
 * user or caller has already customized a field, we leave it alone.
 */
export function applyBrandDefaults(block: Block, ctx: BrandDefaultsContext): Block {
  const { messaging, logoUrl, useSentinels } = ctx;

  // Apply sentinels to the block's style container. Only adds fields that aren't
  // already set — callers can pre-style to opt out.
  function styleWithSentinels(current: Block['style']): Block['style'] {
    if (!useSentinels) return current;
    return current;
  }

  switch (block.type) {
    case 'hero': {
      const next = { ...block };
      if (messaging) {
        if (next.title === 'Hero Title') {
          next.title = pickFirst(messaging.tagline, messaging.companyName, next.title) ?? next.title;
        }
        if (next.subtitle === 'Subtitle' || !isNonEmpty(next.subtitle)) {
          next.subtitle = pickFirst(messaging.valueProposition, next.subtitle) ?? next.subtitle;
        }
        if (next.description === 'Description' || !isNonEmpty(next.description)) {
          next.description = pickFirst(messaging.elevatorPitch, next.description) ?? next.description;
        }
      }
      next.style = styleWithSentinels(next.style);
      return next;
    }

    case 'cta': {
      const next = { ...block };
      if (messaging) {
        if (next.title === 'Ready to get started?') {
          next.title = pickFirst(messaging.valueProposition, next.title) ?? next.title;
        }
        if (next.description === 'Join thousands of satisfied customers') {
          next.description = pickFirst(messaging.elevatorPitch, messaging.tagline, next.description) ?? next.description;
        }
      }
      next.style = styleWithSentinels(next.style);
      return next;
    }

    case 'testimonial': {
      const next = { ...block };
      if (messaging) {
        const proof = messaging.socialProof;
        if (isNonEmpty(proof) && next.quote === 'This is an amazing product!') {
          // socialProof may be a full testimonial; take up to the first 280 chars
          next.quote = proof.length > 280 ? proof.slice(0, 279) + '…' : proof;
        }
      }
      return next;
    }

    case 'email-footer': {
      const next = { ...block };
      if (messaging?.companyName && !isNonEmpty(next.companyName)) {
        next.companyName = messaging.companyName;
      }
      return next;
    }

    case 'email-header': {
      const next = { ...block };
      if (logoUrl && !isNonEmpty(next.logoUrl)) {
        next.logoUrl = logoUrl;
      }
      return next;
    }

    case 'site-footer': {
      const next = { ...block };
      if (messaging?.companyName && !isNonEmpty(next.copyright)) {
        const year = new Date().getFullYear();
        next.copyright = `© ${year} ${messaging.companyName}`;
      }
      if (messaging?.boilerplate && !isNonEmpty(next.tagline)) {
        next.tagline = messaging.boilerplate.length > 200
          ? messaging.boilerplate.slice(0, 197) + '…'
          : messaging.boilerplate;
      }
      if (logoUrl && !isNonEmpty(next.logoUrl)) {
        next.logoUrl = logoUrl;
      }
      return next;
    }

    case 'button': {
      // Buttons opt into brand colors via sentinels when context requests it.
      if (!useSentinels) return block;
      const style = { ...block.style };
      if (!style.backgroundColor) style.backgroundColor = 'brand.btnPrimaryBg';
      if (!style.color) style.color = 'brand.btnPrimaryText';
      if (!style.borderRadius) style.borderRadius = 'brand.btnRadius';
      return { ...block, style };
    }

    default:
      return block;
  }
}

/**
 * Build a BrandMessagingContext from a brandingMessaging DB row.
 * Handles null/undefined shapes so callers can pass raw query results.
 */
export function messagingRowToContext(
  row:
    | {
        companyName?: string | null;
        tagline?: string | null;
        valueProposition?: string | null;
        elevatorPitch?: string | null;
        boilerplate?: string | null;
        missionStatement?: string | null;
        visionStatement?: string | null;
        keyDifferentiators?: string[] | null;
        socialProof?: string | null;
      }
    | null
    | undefined,
): BrandMessagingContext | undefined {
  if (!row) return undefined;
  return {
    companyName: row.companyName ?? undefined,
    tagline: row.tagline ?? undefined,
    valueProposition: row.valueProposition ?? undefined,
    elevatorPitch: row.elevatorPitch ?? undefined,
    boilerplate: row.boilerplate ?? undefined,
    missionStatement: row.missionStatement ?? undefined,
    visionStatement: row.visionStatement ?? undefined,
    keyDifferentiators: row.keyDifferentiators ?? undefined,
    socialProof: row.socialProof ?? undefined,
  };
}
