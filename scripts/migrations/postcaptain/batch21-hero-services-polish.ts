/**
 * Batch 21 — hero + services architectural triage outcome.
 *
 * Triage outcome (full rationale in
 * .planning/postcaptain-replication/decisions.md):
 *
 *   hero h1  (slim vs tall hero)
 *     Architectural — live's hero is ~1580px tall and includes the
 *     trust-strip + scroll-down chrome. Local is intentionally slim
 *     (~311px). Reproducing the tall layout would require a new
 *     block type or a major hero block refactor (extra logo-strip
 *     block, scroll-cue block). Documented as accepted gap.
 *
 *   hero h2  (secondary CTA solid white)
 *     CSS-only on existing hero block — close it here.
 *     elementStyles.secondaryCta.backgroundColor: transparent → #FFFFFF
 *     and color #FFFFFF → #004D80 to match the primary CTA palette.
 *
 *   hero h3  (subheading width)
 *     CSS-only — add a maxWidth + margin auto on the description so
 *     it wraps at live's two-line break.
 *
 *   services sv1  (circular icon badges replacing check bullets)
 *     The benefit lists currently render as a plain HTML <ul class="seu-list">
 *     inside a text block. Live shows three large circular green icon
 *     badges next to each list item.
 *
 *     Two paths considered:
 *     (a) Add a new "icon-list" block type — universal but a heavy
 *         multi-file change.
 *     (b) Inject inline icon spans (Material Icons) into each <li>
 *         and add a scoped customCSS rule on the services-section to
 *         render them as circular tinted backgrounds.
 *
 *     We pick (b) — it's universal-friendly (the seu-list class is
 *     already postcaptain-scoped, and the fix is plain HTML/CSS that
 *     any block can use). It's also a clean revert if we change minds.
 *
 *   services sv3  (green border around panel)
 *     Already present (`border: 2px solid #CCE1D0` on panel
 *     elementStyle). Asserted as no-op.
 *
 * Idempotent.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch21-hero-services-polish.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Block = Record<string, unknown> & {
  id?: string;
  type?: string;
  blocks?: Block[];
  columns?: Array<Record<string, unknown> & { blocks?: Block[] }>;
};

interface PostContent {
  blocks: Block[];
  version?: string;
}

function findBlockById(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (Array.isArray(b.blocks)) {
      const r = findBlockById(b.blocks, id);
      if (r) return r;
    }
    if (Array.isArray(b.columns)) {
      for (const col of b.columns ?? []) {
        if (Array.isArray(col?.blocks)) {
          const r = findBlockById(col.blocks as Block[], id);
          if (r) return r;
        }
      }
    }
    // sticky-scroll-tabs nests its children under panels[].blocks[]
    const panels = (b as Record<string, unknown>).panels;
    if (Array.isArray(panels)) {
      for (const p of panels) {
        if (p && typeof p === 'object' && Array.isArray((p as { blocks?: Block[] }).blocks)) {
          const r = findBlockById((p as { blocks: Block[] }).blocks, id);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

const SEU_ICON: Record<string, string[]> = {
  'panel-impl-list': ['lightbulb', 'hub', 'tune'],
  'panel-projects-list': ['workspaces', 'gps_fixed', 'schedule'],
  'panel-support-list': ['handshake', 'people', 'auto_awesome'],
};

function injectSeuIcons(html: string, icons: string[]): { html: string; changed: boolean } {
  // Match each <li> and prepend a Material Icons span if not already there.
  const liRe = /<li(\s[^>]*)?>([\s\S]*?)<\/li>/g;
  let i = 0;
  let changed = false;
  const out = html.replace(liRe, (full, attrs: string | undefined, inner: string) => {
    const icon = icons[i] ?? icons[0];
    i += 1;
    if (inner.includes('seu-icon')) return full; // idempotent
    changed = true;
    const span = `<span class="seu-icon material-icons" data-icon="${icon}">${icon}</span>`;
    return `<li${attrs ?? ''}>${span}<span class="seu-text">${inner.trim()}</span></li>`;
  });
  return { html: out, changed };
}

const SERVICES_RULE = `/*batch21-services*/
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list { list-style: none !important; padding-left: 0 !important; margin: 0 !important; display: flex !important; flex-direction: column !important; gap: 18px !important; }
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list li { display: flex !important; align-items: center !important; gap: 14px !important; }
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list .seu-icon { font-family: 'Material Icons', 'Material Icons Outlined' !important; font-weight: normal !important; font-size: 22px !important; line-height: 1 !important; letter-spacing: normal !important; text-transform: none !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; width: 44px !important; height: 44px !important; min-width: 44px !important; border-radius: 999px !important; background-color: #C8E6CD !important; color: #2F7A47 !important; -webkit-font-feature-settings: 'liga' !important; font-feature-settings: 'liga' !important; }
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list .seu-text { color: #0A3A5C !important; font-family: 'Poppins', system-ui, sans-serif !important; font-weight: 600 !important; font-size: 15px !important; line-height: 1.4 !important; }`;

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;
  const log: string[] = [];

  // h2 — secondaryCta solid white
  const hero = findBlockById(parsed.blocks, 'hero-1') as
    | (Block & { elementStyles?: Record<string, Record<string, unknown>> })
    | null;
  if (hero?.elementStyles?.secondaryCta) {
    const sec = hero.elementStyles.secondaryCta;
    let changed = false;
    if (sec.backgroundColor !== '#FFFFFF') {
      sec.backgroundColor = '#FFFFFF';
      changed = true;
    }
    if (sec.color !== '#004D80') {
      sec.color = '#004D80';
      changed = true;
    }
    if (sec.borderColor !== '#FFFFFF') {
      sec.borderColor = '#FFFFFF';
      changed = true;
    }
    if (changed) {
      log.push('h2: hero-1 secondaryCta filled solid white (color #004D80)');
    } else {
      log.push('h2: hero-1 secondaryCta already solid white — skipped');
    }

    // h3 — constrain description width
    const desc = (hero.elementStyles.description ??= {});
    if (desc.maxWidth !== '640px' || desc.margin !== '0 auto') {
      desc.maxWidth = '640px';
      desc.margin = '0 auto';
      log.push('h3: hero-1 description maxWidth 640px + center margin');
    } else {
      log.push('h3: hero-1 description already constrained — skipped');
    }
  } else {
    log.push('h2/h3: hero-1 NOT FOUND or no elementStyles — skipped');
  }

  // sv1 — inject Material Icons spans into each panel's seu-list
  for (const [id, icons] of Object.entries(SEU_ICON)) {
    const list = findBlockById(parsed.blocks, id) as
      | (Block & { content?: string })
      | null;
    if (!list) {
      log.push(`sv1: ${id} NOT FOUND — skipped`);
      continue;
    }
    const before = (list.content ?? '') as string;
    const { html, changed } = injectSeuIcons(before, icons);
    if (changed) {
      list.content = html;
      log.push(`sv1: ${id} icons injected (${icons.join('/')})`);
    } else {
      log.push(`sv1: ${id} already has seu-icons — skipped`);
    }
  }

  // sv1 — append scoped customCSS rule on the services-section
  const servicesSection = findBlockById(parsed.blocks, 'services-section') as
    | (Block & { customCSS?: string })
    | null;
  if (servicesSection) {
    let css = servicesSection.customCSS ?? '';
    const stripMarker = (src: string, marker: string): string => {
      const idx = src.indexOf(marker);
      if (idx < 0) return src;
      const nextMarker = src.slice(idx + 1).search(/\/\*batch\d+/);
      const endIdx = nextMarker < 0 ? src.length : idx + 1 + nextMarker;
      return (src.slice(0, idx) + src.slice(endIdx)).trim();
    };
    css = stripMarker(css, '/*batch21-services*/');
    css = (css ? css + '\n' : '') + SERVICES_RULE;
    servicesSection.customCSS = css;
    log.push('sv1: services-section customCSS updated');
  } else {
    log.push('sv1: services-section NOT FOUND — skipped');
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch21-hero-services-polish applied:');
  for (const line of log) console.log(' -', line);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
