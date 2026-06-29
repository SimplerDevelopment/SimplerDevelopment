# Social Assets — SimplerDevelopment Launch

> Maintainer drafts. Not auto-published. All facts are citable from the source documents
> listed below. Review against live inventory before posting.

**Last verified:** 2026-06-27
**Sources:** `docs/agents/ai-overview.md`, `vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md`,
`vault/05 - Feature Specs/FEATURE-INVENTORY-api-mcp.md`, `marketing/feature-pages/`,
`marketing/seo/ai-seo-plan.md`, `README.md`

---

## Citable facts (verified as of 2026-06-27)

Use these numbers in posts. Do not substitute alternatives.

| Fact | Source |
|---|---|
| Apache-2.0 license | `README.md`, `LICENSE` |
| 450 MCP tools at `POST /api/mcp` | `docs/agents/ai-overview.md`, `tests/unit/mcp-tool-registry-baseline.test.ts` |
| 156 `brain_*` tools (Company Brain namespace) | `docs/agents/ai-overview.md` |
| 47 built-in block types | `vault/05 - Feature Specs/FEATURE-INVENTORY-api-mcp.md` |
| 22 product domains | `vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md` (22 sections) |
| ~50 named MCP scopes | `docs/agents/ai-overview.md` |
| OpenAPI 3.1 spec at `/openapi.yaml` (1590 lines, v1 REST) | `vault/05 - Feature Specs/FEATURE-INVENTORY-api-mcp.md` |
| pgvector for Company Brain semantic search | `docs/agents/ai-overview.md` |
| Self-hostable on Vercel + Postgres | `README.md` |
| Yjs CRDT for visual editor + pitch deck collaboration | `docs/agents/ai-overview.md` |
| TOTP/MFA shipped 2026-06-26 | `vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md` (domain 17) |
| Approval-link pattern for live MCP writes | `docs/agents/ai-overview.md`, `vault/05 - Feature Specs/FEATURE-INVENTORY-api-mcp.md` |

## Do NOT claim in any post

These are incomplete, dormant, or have open fate decisions as of 2026-06-27:

- Social publishing channels (only email channel is built)
- Voice assistant (built but widget not mounted; not shipped)
- Print designer (fate decision open: invest/defer/cut)
- Visual workflow builder (on dev branch, not merged to main)
- Microsoft 365 BYO-app credentials (phase 3+, not implemented)
- SDK / npm client library (not built)
- API changelog (not built)
- Public OAuth developer console (not built)

---

## Channel matrix

| File | Channels covered |
|---|---|
| `social/launch-announcements.md` | GitHub release, Product Hunt, Hacker News, Reddit (r/selfhosted + r/SaaS), LinkedIn, X/Twitter thread, Bluesky, Dev.to + Medium intros |
| `social/engineering-posts.md` | 6 engineering story post ideas for technical blogs, newsletters, and dev community posts |
| `social/screenshot-gif-recommendations.md` | Per-channel media guidance — what to capture, recommended dimensions, formats |

### Channel tone guide

| Channel | Tone | Adjectives to avoid |
|---|---|---|
| GitHub | Technical release-note tone; readers are developers evaluating the codebase | "powerful", "comprehensive", "beautiful" |
| Product Hunt | Punchy; benefits-first; one tagline + a clear description; first comment expands technical depth | all superlatives |
| Hacker News | Understated, specific, no marketing language; state what it does and why you built it | all marketing adjectives |
| Reddit r/selfhosted | Community peer tone; lead with the self-hosting angle; honest about setup requirements | any hype |
| Reddit r/SaaS | Founder-to-founder; business context and motivation; not a product pitch | generic claims |
| LinkedIn | Professional; agency / operator audience; business outcome framing | jargon that alienates non-devs |
| X/Twitter | Punchy; thread of 6-8 posts; each post self-contained; hook-first | filler words |
| Bluesky | Same as X; slightly more dev/open-source-friendly audience | same |
| Dev.to / Medium | Long-form intro; technical depth; problem-solution-architecture arc | none |
