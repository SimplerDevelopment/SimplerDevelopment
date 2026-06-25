# Roast: Visual Editor — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SimplerDevelopment's Visual Editor is a block-based WYSIWYG page builder embedded in the portal: the portal shell renders around a sandboxed `<iframe>` that loads the live public-site renderer, and the two sides communicate exclusively through a typed postMessage protocol (30+ message types). The portal shell owns block state and persistence; the iframe owns layout, selection hit-testing, drag-and-drop, and inline text editing. It supports multi-breakpoint viewport switching, an undo stack with coalescing (for drag and slider sessions), right-click context menus, a layers panel for block-tree navigation, per-block settings panels in the sidebar, element-level style editing (typography, spacing, background), real-time collaboration (presence avatars, live cursors via Y.Doc), and revision history. Block content is stored as JSON in `posts.content`; AI agents can write blocks directly via the `posts_update` MCP tool and a `blocks://schema` MCP resource.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies using SD to build and manage client websites; their team members and clients who edit page content directly in the portal.
- **End user:** Agency staff and, potentially, their clients doing self-serve content edits in a white-labeled portal at the agency's own domain.
- **Monetization:** Bundled inside the "Sites" module subscription — not a standalone paid add-on today. Value is retention and switching-cost, not a separate revenue line. Could become a paid white-label embed or a hosted page-builder API layer if spun out.

## The edge
- **iframe-isolation architecture is load-bearing for correctness.** By loading the actual public renderer in the iframe, the editor shows a pixel-accurate live preview — not a simulated one — which eliminates the class of "looks different in preview vs. published" bugs that plague Builder.io and Plasmic's design-system-divergence problems.
- **AI agents can write blocks natively.** The `posts_update` MCP tool and `blocks://schema` resource mean an AI agent can compose, restructure, or generate an entire page in one call — no "export to code" step. No Webflow, Framer, or Wix equivalent exists today.
- **Revision history + collaboration are first-class.** Y.Doc presence, live cursors, and threaded block-anchored comments are built in — not a premium tier. For agency teams editing client sites collaboratively, this is table-stakes functionality Webflow gates behind high tiers.
- **Undo coalescing for drag/slider interactions.** The `coalesce` flag on `BLOCKS_UPDATE` ensures drag-and-drop and slider scrubbing don't pollute the undo stack — a UX detail that distinguishes mature editors from shallow ones.
- **Lockstep block registration prevents drift.** The `simplerdev-block-type` skill enforces that every new block type registers in TS types, block settings, the iframe registry, and the production renderer in a single commit — a discipline most DIY page builders skip and pay for later in broken previews.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: Webflow, Builder.io, Framer, Plasmic, Wix.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That the postMessage iframe architecture — despite being the right call for preview fidelity — can be maintained and extended by a tiny team without accumulating fatal complexity debt, given that `BlockContentEditor.tsx` is already a 2018-line god file, `HtmlRenderEditor.tsx` is 1694 lines, and any new editor feature must be threaded through both sides of a typed message protocol simultaneously — making every addition progressively more expensive and every bug harder to isolate than it would be in a conventional DOM-coupled editor.
