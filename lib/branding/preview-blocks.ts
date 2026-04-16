/**
 * Build a representative block list for the brand preview page.
 *
 * Pure: takes branding + messaging, returns a Block[]. No DB reads.
 * Output blocks reference brand sentinels so the preview tracks live edits
 * through the BrandingProvider CSS variables.
 */

import type { Block, HeroBlock, HeadingBlock, TextBlock, CardGridBlock, CtaBlock, SiteFooterBlock } from '@/types/blocks';
import type { ResolvedBranding } from '@/lib/branding';
import type { BrandMessagingContext } from './block-defaults';

interface BuildParams {
  branding: ResolvedBranding;
  messaging?: BrandMessagingContext;
}

export function buildPreviewBlocks({ branding, messaging }: BuildParams): Block[] {
  const company = messaging?.companyName?.trim() || 'Your Company';
  const tagline = messaging?.tagline?.trim() || 'A bold tagline that captures your brand.';
  const valueProp =
    messaging?.valueProposition?.trim() ||
    'Explain what you do and why it matters to your customers.';
  const pitch =
    messaging?.elevatorPitch?.trim() ||
    messaging?.missionStatement?.trim() ||
    'This is a short elevator pitch or mission statement that appears under the hero.';
  const boilerplate =
    messaging?.boilerplate?.trim() ||
    'Longer supporting copy lives here — your company story, approach, or a paragraph that anchors the page.';
  const differentiators = (messaging?.keyDifferentiators ?? []).filter((d) => d.trim().length > 0);

  const cardSource = differentiators.length > 0
    ? differentiators.slice(0, 3)
    : ['Thoughtful craft', 'Clear communication', 'Results you can measure'];

  const cards = cardSource.map((title, i) => ({
    id: `preview-card-${i + 1}`,
    title,
    description:
      i === 0
        ? 'A short supporting sentence that expands on this differentiator.'
        : i === 1
        ? 'Another supporting sentence — keep it tight and specific.'
        : 'One more sentence showing how this shows up in your work.',
    icon: ['auto_awesome', 'insights', 'verified'][i] ?? 'check_circle',
  }));

  const hero: HeroBlock = {
    id: 'preview-hero',
    type: 'hero',
    order: 0,
    title: tagline,
    subtitle: valueProp,
    description: pitch,
    ctaText: 'Get Started',
    ctaLink: '#',
    secondaryCtaText: 'Learn More',
    secondaryCtaLink: '#',
    style: {
      backgroundColor: 'brand.bg',
      color: 'brand.text',
      padding: '6rem 2rem',
    },
  };

  const heading: HeadingBlock = {
    id: 'preview-heading',
    type: 'heading',
    order: 1,
    content: 'What we do',
    level: 2,
    alignment: 'left',
    style: {
      color: 'brand.text',
      padding: '3rem 0 1rem',
    },
  };

  const text: TextBlock = {
    id: 'preview-text',
    type: 'text',
    order: 2,
    content: boilerplate,
    alignment: 'left',
    size: 'base',
    style: {
      color: 'brand.text',
      padding: '0 0 3rem',
    },
  };

  const cardGrid: CardGridBlock = {
    id: 'preview-cards',
    type: 'card-grid',
    order: 3,
    title: 'What sets us apart',
    description: 'A few things clients count on.',
    cards,
    columns: 3,
    style: {
      padding: '2rem 0 4rem',
      color: 'brand.text',
    },
  };

  const cta: CtaBlock = {
    id: 'preview-cta',
    type: 'cta',
    order: 4,
    title: `Ready to work with ${company}?`,
    description: valueProp,
    primaryButtonText: 'Start a project',
    primaryButtonUrl: '#',
    secondaryButtonText: 'Talk to us',
    secondaryButtonUrl: '#',
    backgroundStyle: 'solid',
    style: {
      backgroundColor: 'brand.primary',
      color: 'brand.btnPrimaryText',
      padding: '4rem 2rem',
    },
  };

  const footer: SiteFooterBlock = {
    id: 'preview-footer',
    type: 'site-footer',
    order: 5,
    logoUrl: branding.logoUrl || branding.logoRectUrl || undefined,
    logoAlt: branding.logoAlt || company,
    tagline: tagline,
    linkGroups: [
      {
        label: 'Company',
        links: [
          { label: 'About', href: '#' },
          { label: 'Contact', href: '#' },
        ],
      },
      {
        label: 'Resources',
        links: [
          { label: 'Blog', href: '#' },
          { label: 'Careers', href: '#' },
        ],
      },
    ],
    contactInfo: {
      email: messaging?.companyName ? `hello@${slugForEmail(company)}` : 'hello@example.com',
    },
    copyright: `© ${new Date().getFullYear()} ${company}. All rights reserved.`,
    // SiteFooterBlockRender reads these directly (not via sentinels), so pass
    // CSS vars — the BrandingProvider wraps the render and defines them.
    backgroundColor: 'var(--brand-text)',
    textColor: 'var(--brand-bg)',
    accentColor: 'var(--brand-accent)',
  };

  return [hero, heading, text, cardGrid, cta, footer];
}

function slugForEmail(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24) || 'example';
}
