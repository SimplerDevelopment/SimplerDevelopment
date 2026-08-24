/**
 * Source products we migrate people off, one entry per `/migrate/<slug>` page.
 *
 * Shaped deliberately like `lib/data/solutions.ts`: a flat array plus two
 * lookups, consumed by `app/(pages)/migrate/[slug]/page.tsx` through
 * `generateStaticParams`. Adding a competitor is an entry here, never a new
 * page file — which is the whole reason these are templated rather than
 * hand-written. "Migrate from HubSpot" and "migrate from WordPress" are
 * separate head terms and one URL cannot rank for both.
 *
 * TRUTHFULNESS RULE — read before editing any `how` string.
 *
 * There is no one-click importer for any product listed here, and nothing on
 * these pages may imply one. What actually exists in this repo is:
 *
 *   - `POST /api/portal/crm/import` (+ `/preview`) — CSV contacts/companies/deals
 *   - `/api/portal/snapshots` + `[id]/import` + `[id]/download` — whole-site snapshots
 *   - `posts_upload_html` / `posts_upload_html_zip` — an HTML bundle into the editor
 *   - `brain/glossary/bulk-import`, `brain/topics/import-from-tags`
 *
 * Everything else is a done-for-you rebuild through the portal's own tools.
 * That is a perfectly good offer — it is what an agency sells — but it has to
 * be described as what it is. Every `how` line below maps to one of the
 * mechanisms above or says plainly that a human rebuilds it.
 *
 * `caveats` is not a disclaimer nobody reads: it is the most useful part of
 * the page for a buyer mid-evaluation, and it keeps these pages honest in the
 * same way `/compare` refuses to invent a competitor feature matrix.
 */

export type MigrationCategory = 'website' | 'crm' | 'projects';

export interface MigrationSource {
  slug: string;
  /** Product name exactly as its owner writes it. */
  name: string;
  category: MigrationCategory;
  /** One line under the H1. */
  tagline: string;
  /** Meta description; also the Service schema description. */
  description: string;
  /** Why teams tell us they are leaving. Factual, never disparaging. */
  reasons: string[];
  /** What comes across, where it lands, and by which real mechanism. */
  moves: { item: string; lands: string; how: string }[];
  /** What does NOT come across. The honest half. */
  caveats: string[];
  /** When staying put is the right answer. Mirrors /compare's honesty band. */
  stayIf: string;
  /** SD solution slugs this lands in — internal linking. */
  landsIn: string[];
  timeline: string;
}

export const CATEGORY_LABELS: Record<MigrationCategory, string> = {
  website: 'Website & CMS',
  crm: 'CRM & Marketing',
  projects: 'Projects & Ops',
};

export const migrationSources: MigrationSource[] = [
  // ── Website builders ─────────────────────────────────────────────────────
  {
    slug: 'wordpress',
    name: 'WordPress',
    category: 'website',
    tagline: 'Keep the content and the SEO. Lose the plugin maintenance.',
    description:
      'Migrate a WordPress site to SimplerDevelopment — posts, pages, media, categories and redirects moved for you, rebuilt in a visual block editor with no plugins to patch.',
    reasons: [
      'Plugin and core updates are a standing maintenance job, and a security one',
      'Page speed degrades as plugins accumulate, and nobody owns the cleanup',
      'Editors are nervous about touching layout in case a theme update reverts it',
      'The CRM, email tool and booking widget are three more subscriptions bolted on',
    ],
    moves: [
      {
        item: 'Posts, pages and taxonomies',
        lands: 'CMS posts with categories and tags',
        how: 'Your WXR export is the source of truth; we bring content across and rebuild each layout in the block editor.',
      },
      {
        item: 'Media library',
        lands: 'Portal media library',
        how: 'Images and documents are re-uploaded and re-linked so no post points at the old host.',
      },
      {
        item: 'Contact and lead forms',
        lands: 'Surveys and forms, wired to the CRM',
        how: 'Rebuilt as native forms so submissions create a CRM contact instead of only sending an email.',
      },
      {
        item: 'URLs and rankings',
        lands: 'Matching paths, plus redirects',
        how: 'We keep slugs where we can and map the rest, so existing rankings and inbound links survive the move.',
      },
    ],
    caveats: [
      'Custom PHP themes and plugins do not transfer — bespoke functionality is re-implemented, and we scope that before you commit',
      'Shortcodes have no equivalent; whatever they rendered is rebuilt as blocks',
      'WooCommerce catalogues move to the built-in store, but payment history stays with your old processor records',
    ],
    stayIf:
      'you rely on a specific WordPress plugin with no equivalent anywhere else, and rebuilding it costs more than the maintenance you are trying to escape.',
    landsIn: ['websites', 'crm', 'ecommerce'],
    timeline: 'Most sites: 1–3 weeks',
  },
  {
    slug: 'squarespace',
    name: 'Squarespace',
    category: 'website',
    tagline: 'A site you can actually extend, without leaving the visual editor.',
    description:
      'Migrate from Squarespace to SimplerDevelopment — pages, blog posts and media rebuilt in a visual block editor, with a CRM, email and bookings in the same login.',
    reasons: [
      'You have outgrown the template and cannot extend past it',
      'Client work needs multiple sites under one roof, not one account per site',
      'Bookings, email and CRM are separate products with separate bills',
      'Exporting your own content turns out to be harder than expected',
    ],
    moves: [
      {
        item: 'Pages and blog posts',
        lands: 'CMS posts and pages',
        how: "Squarespace's WordPress-format export carries the text; layout is rebuilt block by block against your live site.",
      },
      {
        item: 'Products',
        lands: 'The built-in store',
        how: 'Catalogue, variants and options are recreated with Stripe payments attached.',
      },
      {
        item: 'Scheduling',
        lands: 'Booking pages',
        how: 'Services, durations and availability are rebuilt as native booking pages on your own domain.',
      },
      {
        item: 'Design system',
        lands: 'Brand profile',
        how: 'Fonts, colours and logo become a brand profile every page, email and deck then inherits.',
      },
    ],
    caveats: [
      "Squarespace's export is partial by design — it omits product pages, album and event pages, custom CSS and some page types, so those are rebuilt from the live site rather than imported",
      'Only one blog page comes across in an export; additional ones are handled by hand',
      'Squarespace-specific blocks have no direct equivalent and are rebuilt with the closest native block',
    ],
    stayIf:
      'one person edits one small site, you are happy inside the template, and you do not need a CRM or multiple sites.',
    landsIn: ['websites', 'booking', 'ecommerce'],
    timeline: 'Most sites: 1–2 weeks',
  },
  {
    slug: 'wix',
    name: 'Wix',
    category: 'website',
    tagline: 'Get your site — and your content — back under your own control.',
    description:
      'Migrate from Wix to SimplerDevelopment. Because Wix has no full-site export, we rebuild your pages faithfully from the live site and hand you a portable, self-hostable result.',
    reasons: [
      'There is no way to take the site with you, which is itself the reason to go',
      'The editor makes structural change harder the bigger the site gets',
      'Apps for CRM, email and booking each add a bill and a login',
      'You want the option to self-host, or simply to own the code',
    ],
    moves: [
      {
        item: 'Pages and layout',
        lands: 'CMS pages built from blocks',
        how: 'Rebuilt from your live site page by page — this is manual work, and we scope it per page before starting.',
      },
      {
        item: 'Blog posts',
        lands: 'CMS posts with categories and tags',
        how: 'Pulled from the live blog and re-laid out, with slugs preserved where possible.',
      },
      {
        item: 'Contact forms and enquiries',
        lands: 'Forms wired to the CRM',
        how: 'Rebuilt natively so an enquiry becomes a CRM contact and a deal, not just an email.',
      },
      {
        item: 'Store and bookings',
        lands: 'Built-in store and booking pages',
        how: 'Products and services are recreated with Stripe attached.',
      },
    ],
    caveats: [
      'Wix does not offer a full-site export, so nothing here is an automated import — every page is rebuilt, and the quote reflects the real page count',
      'Wix Apps and Velo code do not transfer; anything custom is re-implemented and scoped up front',
      'Historical form submissions generally cannot be retrieved from Wix and stay behind',
    ],
    stayIf:
      'the site is a handful of static pages, nothing depends on it commercially, and a rebuild is not worth the effort.',
    landsIn: ['websites', 'crm', 'booking'],
    timeline: 'Most sites: 2–4 weeks',
  },
  {
    slug: 'webflow',
    name: 'Webflow',
    category: 'website',
    tagline: 'Keep the craft. Add a CRM, email and bookings behind it.',
    description:
      'Migrate from Webflow to SimplerDevelopment — your exported HTML bundle uploads straight into the editor, and CMS collections become native posts with a CRM behind them.',
    reasons: [
      'The design is finished; what is missing is everything behind it',
      'CMS item limits and seat pricing bite as the site and team grow',
      'Client handover is awkward — non-designers are wary of the editor',
      'Forms, CRM, email and booking are still separate products',
    ],
    moves: [
      {
        item: 'The whole front end',
        lands: 'A page in the block editor',
        how: "Webflow's static HTML/CSS/JS export uploads as a zip directly into the editor — this one genuinely is an upload, not a rebuild.",
      },
      {
        item: 'CMS collections',
        lands: 'CMS posts and custom post types',
        how: 'Collections export as CSV and are mapped to post types with their fields intact.',
      },
      {
        item: 'Form submissions',
        lands: 'CRM contacts and deals',
        how: 'Forms are re-pointed so each submission creates a CRM record and enters a pipeline.',
      },
      {
        item: 'Design tokens',
        lands: 'Brand profile',
        how: 'Typography and colour become a brand profile shared by pages, emails and decks.',
      },
    ],
    caveats: [
      'Webflow interactions and animations are tied to its runtime; complex motion is rebuilt rather than transferred',
      'An exported site is static — anything that depended on Webflow hosting behaviour is re-implemented',
      'Webflow Ecommerce orders stay in Webflow; the catalogue moves, the order history does not',
    ],
    stayIf:
      'you are a design studio shipping brochure sites, you are happy in the Designer, and nothing needs a CRM behind it.',
    landsIn: ['websites', 'crm', 'ecommerce'],
    timeline: 'Most sites: 1–2 weeks',
  },

  // ── CRM & marketing ──────────────────────────────────────────────────────
  {
    slug: 'hubspot',
    name: 'HubSpot',
    category: 'crm',
    tagline: 'The same pipeline, without the per-seat bill or the upgrade wall.',
    description:
      'Migrate from HubSpot to SimplerDevelopment. Contacts, companies and deals import by CSV with every row previewed before it writes, and your pipelines are rebuilt stage for stage.',
    reasons: [
      'Cost climbs with seats and contacts faster than the value does',
      'The feature you need sits one tier up, every time',
      'Marketing, CMS and CRM are one vendor but still feel like three products',
      'You want the data in a database you can query, and export without ceremony',
    ],
    moves: [
      {
        item: 'Contacts and companies',
        lands: 'CRM contacts and companies',
        how: 'CSV export straight into the CRM importer, which previews and validates every row before writing anything.',
      },
      {
        item: 'Deals and pipelines',
        lands: 'CRM deals on rebuilt pipelines',
        how: 'Stages are recreated in order, then deals import onto the right stage rather than all landing in the first one.',
      },
      {
        item: 'Custom properties',
        lands: 'CRM custom fields',
        how: 'Defined as native custom fields first so imported values have somewhere to land.',
      },
      {
        item: 'Lists and marketing email',
        lands: 'Email lists, segments and campaigns',
        how: 'Subscribers import by CSV; templates are rebuilt in the campaign editor.',
      },
    ],
    caveats: [
      'Workflows and sequences are rebuilt as automations — the logic moves, the configuration does not',
      'Reporting history and attribution built up inside HubSpot stays there; new attribution starts from first touch on your site',
      'Conversation and email threads are not migrated wholesale; we import the records they hang off',
    ],
    stayIf:
      'you have a large sales team deep in HubSpot-specific tooling and the switching cost outweighs the licence.',
    landsIn: ['crm', 'email-marketing', 'automations'],
    timeline: 'Most CRMs: 1–2 weeks',
  },
  {
    slug: 'mailchimp',
    name: 'Mailchimp',
    category: 'crm',
    tagline: 'Your list, in the same system as the site it signed up on.',
    description:
      'Migrate from Mailchimp to SimplerDevelopment — audiences, segments and templates moved into a campaign builder that shares one database with your CRM and website.',
    reasons: [
      'Pricing scales on audience size including people who never open anything',
      'The list lives apart from the CRM and the website that created it',
      'Rebuilding the same segment in three tools is routine',
      'You want subscribers and customers to be the same record',
    ],
    moves: [
      {
        item: 'Audiences and subscribers',
        lands: 'Email lists and subscribers',
        how: 'Audience CSV export into the importer, with consent status and subscribe dates preserved.',
      },
      {
        item: 'Segments and tags',
        lands: 'Segments',
        how: 'Recreated as native segments that query the same database your CRM uses.',
      },
      {
        item: 'Templates',
        lands: 'Email templates',
        how: 'Rebuilt in the campaign builder against your brand profile so they match the site.',
      },
      {
        item: 'Signup forms',
        lands: 'Forms and surveys',
        how: 'Rebuilt natively so a signup creates a CRM contact as well as a subscriber.',
      },
    ],
    caveats: [
      'Historical open and click statistics stay in Mailchimp — reporting starts fresh on the first campaign you send here',
      'Customer Journeys are rebuilt as automations rather than imported',
      'Sending reputation is tied to the sending domain and provider, so warm up as you would with any move',
    ],
    stayIf:
      'email is genuinely all you do, the list is small, and you have no website or CRM you want it joined to.',
    landsIn: ['email-marketing', 'crm', 'automations'],
    timeline: 'Most lists: 3–5 days',
  },
  {
    slug: 'activecampaign',
    name: 'ActiveCampaign',
    category: 'crm',
    tagline: 'Keep the automation thinking. Drop a subscription.',
    description:
      'Migrate from ActiveCampaign to SimplerDevelopment — contacts, lists and deals imported by CSV, with automations rebuilt against a CRM and website that share one database.',
    reasons: [
      'Contact-tier pricing keeps stepping up as the list grows',
      'Automations are powerful but live away from the site that triggers them',
      'You are paying separately for the CRM half and the email half',
      'You want the underlying data portable, not locked to a vendor',
    ],
    moves: [
      {
        item: 'Contacts and lists',
        lands: 'CRM contacts and email lists',
        how: 'CSV export into the importer, previewed row by row, with list membership preserved.',
      },
      {
        item: 'Deals and pipelines',
        lands: 'CRM deals and pipelines',
        how: 'Pipelines and stages are rebuilt first, then deals import onto the correct stage.',
      },
      {
        item: 'Custom fields',
        lands: 'CRM custom fields',
        how: 'Created natively ahead of the import so values land in a real field, not a note.',
      },
      {
        item: 'Automations',
        lands: 'Portal automations',
        how: 'Rebuilt trigger by trigger against native events — a form submission, a stage change, a booking.',
      },
    ],
    caveats: [
      'Automation history and per-contact engagement scores do not transfer',
      'Site-tracking history starts again from the day you switch',
      'Conditional content inside campaigns is rebuilt with native segment sends',
    ],
    stayIf:
      'you run deep multi-branch lifecycle automation that is your competitive advantage and works exactly as you want it.',
    landsIn: ['email-marketing', 'crm', 'automations'],
    timeline: 'Most accounts: 1–2 weeks',
  },

  // ── Projects & ops ───────────────────────────────────────────────────────
  {
    slug: 'monday',
    name: 'Monday.com',
    category: 'projects',
    tagline: 'The same boards, next to the client work they are actually about.',
    description:
      'Migrate from Monday.com to SimplerDevelopment — boards, groups, items and updates rebuilt as projects and kanban cards that sit beside the CRM and the sites they relate to.',
    reasons: [
      'Per-seat pricing means the people who only need to look cost the same as the people doing the work',
      'The board knows nothing about the client record or the site it concerns',
      'Dashboards multiply until nobody trusts which one is current',
      'You want project status visible to clients without buying them seats',
    ],
    moves: [
      {
        item: 'Boards and groups',
        lands: 'Projects and kanban columns',
        how: 'Rebuilt through the portal, one column per group, in the same order.',
      },
      {
        item: 'Items and subitems',
        lands: 'Cards and checklists',
        how: 'Board export drives the rebuild; subitems become checklist items on the parent card.',
      },
      {
        item: 'Columns and status fields',
        lands: 'Custom fields and labels',
        how: 'Defined as project custom fields and labels before items land, so values are preserved.',
      },
      {
        item: 'Updates and files',
        lands: 'Card comments and attachments',
        how: 'Threaded updates are re-attached to their card; files are re-uploaded to the media library.',
      },
    ],
    caveats: [
      'Automations and third-party integrations are rebuilt, not imported',
      'Dashboards and widgets have no direct equivalent; reporting is rebuilt against the same data',
      'Timeline and workload views map to sprints and kanban rather than reproducing Monday exactly',
    ],
    stayIf:
      'the boards are the product for you, the whole company lives in them, and no part of your work touches a client site or CRM.',
    landsIn: ['project-management', 'crm', 'agency'],
    timeline: 'Most workspaces: 1–2 weeks',
  },
  {
    slug: 'trello',
    name: 'Trello',
    category: 'projects',
    tagline: 'Same cards. Now attached to the client, the site and the invoice.',
    description:
      'Migrate from Trello to SimplerDevelopment — lists, cards, checklists, labels and comments rebuilt as kanban boards that live alongside your CRM, sites and billing.',
    reasons: [
      'Boards are fine until you need them connected to a client or an invoice',
      'Power-Ups accumulate to cover the gaps, each with its own cost',
      'There is no natural home for the client the board is about',
      'Reporting across boards means exporting to a spreadsheet',
    ],
    moves: [
      {
        item: 'Lists and cards',
        lands: 'Kanban columns and cards',
        how: "Trello's board JSON export is complete, so the rebuild is faithful — order, descriptions and due dates included.",
      },
      {
        item: 'Checklists',
        lands: 'Card checklists',
        how: 'Items come across tickable, with completion state preserved.',
      },
      {
        item: 'Labels and members',
        lands: 'Labels and assignees',
        how: 'Labels are recreated with their colours; members map to portal users you invite.',
      },
      {
        item: 'Comments',
        lands: 'Card comments',
        how: 'Re-attached to their card so the decision trail survives the move.',
      },
    ],
    caveats: [
      'Power-Ups do not transfer; whatever they added is replaced with a native feature or dropped deliberately',
      'Attachments are re-uploaded to the media library, so links inside card text are rewritten',
      'Card activity history beyond comments is not reproduced',
    ],
    stayIf:
      'you use one simple board, love it, and nothing about it needs to know who the client is.',
    landsIn: ['project-management', 'agency'],
    timeline: 'Most boards: 2–5 days',
  },
  {
    slug: 'asana',
    name: 'Asana',
    category: 'projects',
    tagline: 'Projects that know which client, site and deal they belong to.',
    description:
      'Migrate from Asana to SimplerDevelopment — projects, sections, tasks, subtasks and custom fields rebuilt as kanban boards connected to your CRM and client sites.',
    reasons: [
      'Per-seat cost rises with every occasional collaborator',
      'Projects sit apart from the client record and the work product',
      'Portfolios and goals live in a tier above the one you are on',
      'Client visibility means either a seat or a screenshot',
    ],
    moves: [
      {
        item: 'Projects and sections',
        lands: 'Projects and kanban columns',
        how: 'Rebuilt in order from your project export, one column per section.',
      },
      {
        item: 'Tasks and subtasks',
        lands: 'Cards and checklists',
        how: 'Tasks become cards with assignee and due date; subtasks become checklist items.',
      },
      {
        item: 'Custom fields',
        lands: 'Project custom fields',
        how: 'Created before the rebuild so values land in real fields rather than the description.',
      },
      {
        item: 'Portfolios and goals',
        lands: 'Initiatives and goals',
        how: 'Mapped to native initiatives and goals, which link back to the projects underneath them.',
      },
    ],
    caveats: [
      'Rules and automation are rebuilt against native triggers rather than imported',
      'Task activity history and @mention threads beyond comments are not reproduced',
      'Timeline and workload views map to sprints and kanban, not a like-for-like Gantt',
    ],
    stayIf:
      'Asana is your company-wide operating system well beyond client delivery, and moving it is a bigger project than the saving.',
    landsIn: ['project-management', 'crm', 'agency'],
    timeline: 'Most workspaces: 1–2 weeks',
  },
  {
    slug: 'clickup',
    name: 'ClickUp',
    category: 'projects',
    tagline: 'Fewer features you never turned on. The ones you use, connected.',
    description:
      'Migrate from ClickUp to SimplerDevelopment — spaces, lists, tasks, statuses and custom fields rebuilt as projects and kanban boards, with docs landing in a searchable knowledge base.',
    reasons: [
      'Configuration surface is larger than the team will ever use',
      'Performance and complexity grow together as the workspace fills',
      'Docs, tasks and clients are still three disconnected ideas',
      'You want less product, wired to the rest of the business',
    ],
    moves: [
      {
        item: 'Spaces, folders and lists',
        lands: 'Projects and boards',
        how: 'Flattened into a project structure that matches how you actually work, agreed before the rebuild.',
      },
      {
        item: 'Tasks and statuses',
        lands: 'Cards and kanban columns',
        how: 'Task export drives the rebuild; custom statuses become columns in the same order.',
      },
      {
        item: 'Custom fields',
        lands: 'Project custom fields',
        how: 'Defined first so imported values land somewhere queryable.',
      },
      {
        item: 'Docs',
        lands: 'Company Brain documents',
        how: 'Brought into the knowledge base, where they become semantically searchable alongside everything else.',
      },
    ],
    caveats: [
      'Automations, dashboards and ClickApps are rebuilt or intentionally dropped — we agree which before starting',
      'Time-tracking history is summarised rather than reproduced entry for entry',
      'Deeply nested hierarchies are flattened; that is usually the point, but it is a change',
    ],
    stayIf:
      'you genuinely use the breadth of ClickUp and a narrower tool would cost you capability you rely on.',
    landsIn: ['project-management', 'company-brain', 'agency'],
    timeline: 'Most workspaces: 2–3 weeks',
  },
];

export function getMigrationBySlug(slug: string): MigrationSource | undefined {
  return migrationSources.find((m) => m.slug === slug);
}

export function getAllMigrations(): MigrationSource[] {
  return migrationSources;
}

export function getMigrationsByCategory(category: MigrationCategory): MigrationSource[] {
  return migrationSources.filter((m) => m.category === category);
}
