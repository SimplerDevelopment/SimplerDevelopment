# Screenshot + GIF Recommendations — Per Channel

> Capture guidance for launch media. All "what to show" items reference real routes and
> features in the inventory. Do NOT mock or fabricate UI states — capture from a real
> running instance with demo/seed data.
>
> Dimensions are recommendations; match your capture tool's output. Prefer lossless PNG
> for stills; GIF or WebM/MP4 for motion.

---

## Guiding principles

1. **One hero asset per channel.** Viewer attention is short. Pick the one motion clip or
   screenshot that communicates the platform's core differentiation for that audience.
   The other images are supporting evidence.

2. **Show real UI, not mockups.** Run `bun dev` against seed data
   (`bun run db:seed:dev`), then capture from `http://localhost:3000`.

3. **Capture before brand polish is needed.** The functional platform is the asset;
   a raw browser window is fine if the UI is clean. Crop to the relevant area.

4. **Annotate sparingly.** A single callout arrow or text label is fine. Avoid
   watermarks, excessive annotations, or marketing copy layered on top of screenshots.

---

## Asset inventory (name each file before uploading)

| File name | What it shows | Used on |
|---|---|---|
| `demo-mcp-agent-loop.gif` | An MCP client (e.g. Claude.ai) building a page or CRM record via tool calls — terminal or chat UI showing tool invocations + approval link returned | GitHub README hero, HN submission, Dev.to/Medium |
| `portal-overview.png` | Client portal dashboard showing domain modules (brain, CRM, projects, etc.) in the sidebar | Product Hunt gallery, LinkedIn, Bluesky |
| `visual-editor.gif` | Block editor: drag a block, edit inline, preview at mobile breakpoint | Product Hunt hero, X/Twitter thread post 2 |
| `company-brain-search.gif` | Brain ask/chat: a question typed, semantic search result returned with citations | Product Hunt gallery, X/Twitter thread post 4 |
| `crm-pipeline.png` | CRM kanban board with deal cards across configurable stages | LinkedIn, Reddit r/SaaS |
| `mcp-tool-families.png` | Tool namespace table (brain_* 156, kanban_* 39, crm_* 34, etc.) — either from the docs or an annotated screenshot of the API docs page | GitHub README, HN, Dev.to |
| `approval-link-flow.gif` | MCP write tool response showing approvalUrl → browser opening the /approve/[token]/ page → human clicks Approve → content goes live | Engineering blog, Dev.to/Medium |
| `self-host-quickstart.gif` | Terminal: `docker compose up -d && bun install && bun dev` — showing the app booting in under 2 minutes | GitHub README, Reddit r/selfhosted |
| `block-picker.png` | Block picker panel open in the visual editor showing block type grid (47 types visible) | Product Hunt gallery, Dev.to |
| `brain-org-chart.png` | Org chart view in Company Brain portal | LinkedIn |

---

## Per-channel recommendations

### GitHub README

**Hero (above the fold):**
- `demo-mcp-agent-loop.gif` — width 800px. This is the #1 conversion asset: show an AI agent operating the platform, not the portal UI alone.
- The README already has a placeholder: `<!-- HERO: record this GIF before launch — vhs docs/launch/demo.tape -->`

**Supporting:**
- `self-host-quickstart.gif` (immediately below the Quick start section) — show the 5-step install succeeding.
- `mcp-tool-families.png` (inline in the MCP section) — the namespace table is credibility-building for developers.

**Dimensions:** GIF max 800px wide to keep repo page load reasonable. Use `vhs` (VHS tape tool) per the README note, or any terminal recorder. 24 fps.

**Format:** GIF preferred for README compatibility (no video player dependency). Convert to palette-optimized GIF (`ffmpeg -i input.mp4 -vf "fps=24,scale=800:-1:flags=lanczos,palettegen" palette.png && ffmpeg -i input.mp4 -i palette.png -vf "fps=24,scale=800:-1:flags=lanczos,paletteuse" demo.gif`).

---

### Product Hunt

**Gallery limit:** Product Hunt shows 4–6 images/GIFs in a horizontal carousel. Order matters: first image = hero.

| Slot | Asset | Notes |
|---|---|---|
| 1 (hero) | `visual-editor.gif` | Motion beats static for the hero slot. Show the drag-and-drop block editor against a live iframe preview. |
| 2 | `portal-overview.png` | Shows the breadth of what clients get — sidebar with 15+ domain icons. |
| 3 | `company-brain-search.gif` | Demonstrates the RAG / Company Brain differentiator. |
| 4 | `crm-pipeline.png` | CRM is the most universally understood module; validates "real SaaS" not just a site builder. |
| 5 | `block-picker.png` | 47 block types is a concrete, citable claim — show the picker grid. |
| 6 | `mcp-tool-families.png` | Developer credibility; the tool count is the headline differentiator. |

**Dimensions:**
- GIFs: 1270×760px (Product Hunt recommended). Loop max 60s; keep under 20 MB.
- PNGs: 1270×760px or 2:1 aspect ratio at 2x for retina.

**Format:** GIF or MP4. Product Hunt's uploader accepts both; GIF is safer for carousel autoplay.

---

### Hacker News

**Show HN submissions do not support image galleries.** The single most effective HN media choice is the README hero GIF in the linked GitHub repo — that is what readers click through to.

**Action:** Make sure `demo-mcp-agent-loop.gif` is in the repo and renders correctly in the GitHub README before posting. That is your only media lever on HN.

**Optional:** Post a follow-up comment with a direct Imgur or GitHub CDN link to `mcp-tool-families.png` if the tool count discussion takes off.

---

### Reddit — r/selfhosted

**Self-hosting communities respond to "it works" evidence over feature galleries.**

| Priority | Asset | Reason |
|---|---|---|
| 1 | `self-host-quickstart.gif` | Proves self-hosting is actually simple; addresses the first objection. |
| 2 | `portal-overview.png` | Shows what you get after self-hosting. |

**Dimensions:** Reddit image posts display at max 1080px wide in feed. 720×450 or 1080×675 (16:9) works well.

**Format:** Reddit supports PNG, GIF, and MP4. For GIFs > 2 MB, upload as MP4 (Reddit will autoplay it like a GIF). Prefer MP4 for anything with motion.

**Note:** r/selfhosted rule check — verify the subreddit's current self-promotion rules before posting. Framing as "sharing a project" rather than "launching a product" tends to perform better.

---

### Reddit — r/SaaS

**This audience is founders and operators, not sysadmins. Focus on the business logic.**

| Priority | Asset | Reason |
|---|---|---|
| 1 | `crm-pipeline.png` | CRM is the most legible "real business tool" signal for this audience. |
| 2 | `portal-overview.png` | Shows the breadth of per-tenant modules. |

**Dimensions:** Same as r/selfhosted (1080px wide max, 16:9 preferred).

**Note:** r/SaaS has stricter self-promotion rules than r/selfhosted. Check current rules; many require minimum karma or a specific posting format.

---

### LinkedIn

**LinkedIn native images display well in feed. Single large image or a 3–4 image carousel.**

| Slot | Asset |
|---|---|
| 1 | `portal-overview.png` — clean, professional, shows a real product UI |
| 2 | `brain-org-chart.png` — demonstrates the knowledge management angle relevant to operators |
| 3 | `crm-pipeline.png` — deals/pipeline are universally legible to the LinkedIn audience |

**Dimensions:**
- Single image: 1200×628px (Open Graph standard; works for both feed and link preview).
- Carousel: 1080×1080px per slide (LinkedIn Document / Carousel post format). If building a carousel, use square crops of each screenshot.

**Format:** PNG for stills. LinkedIn supports MP4 for native video (max 5GB, up to 10 min) — if you want motion, post the `visual-editor.gif` as a native MP4 rather than an animated GIF.

**Tip:** LinkedIn text posts with a single image outperform link-share posts in organic reach. Write the copy as a native post with the GitHub URL in the first comment, not as the primary link.

---

### X / Twitter

**Twitter/X thread format: the hook post should embed the best motion asset; each subsequent post can embed a still.**

| Thread post | Asset | Notes |
|---|---|---|
| Post 1 (hook) | `demo-mcp-agent-loop.gif` | The hook post must stop scroll. Motion > static. |
| Post 2 (editor) | `visual-editor.gif` | Matches the "what clients get" post. |
| Post 3 (MCP tools) | `mcp-tool-families.png` | The tool count table is tweetable on its own. |
| Post 4 (Brain) | `company-brain-search.gif` | RAG demo — the semantic search result is the proof point. |
| Post 7 (gaps) | None | Text-only; honest gap list. |

**Dimensions:**
- GIFs: max 15 MB on X; keep under 5 MB for fast load. 1280×720 or 800×450 at 24 fps.
- PNGs: 1200×675 (16:9) for in-feed previews.
- X supports MP4 natively (max 512 MB, max 140 sec for free accounts). Post GIFs as MP4 for better quality.

**Format:** Upload motion content as MP4, not GIF, to avoid X's GIF quality degradation. Convert: `ffmpeg -i input.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" output.mp4`

---

### Bluesky

**Bluesky supports up to 4 images per post (no native video in standard posts as of writing — check current limits).**

| Post | Assets (max 4) | Notes |
|---|---|---|
| Hook post | `portal-overview.png`, `visual-editor.gif` | Lead with the portal overview; add the editor GIF as second image if GIFs are supported natively, otherwise describe it. |
| MCP post | `mcp-tool-families.png` | Single image; the table speaks for itself. |
| Setup post | `self-host-quickstart.gif` | Shows the Docker + bun setup working. |

**Dimensions:** 1200×630 recommended. Bluesky uses a 2:1 or 16:9 crop in the feed.

**Format:** PNG for stills. Check Bluesky's current GIF/video support status before the post date — it has expanded since early 2025.

**Alt text:** Bluesky's accessibility culture means alt text on every image is expected, not optional. Write a 1–2 sentence description of each asset.

---

### Dev.to

**Dev.to articles support embedded images and GIFs via standard Markdown. Cover image is the most important asset (displays in the article list feed).**

| Use | Asset | Notes |
|---|---|---|
| Cover image | `demo-mcp-agent-loop.gif` | Dev.to cover images display at 1000×420px (banner ratio). |
| Inline (MCP section) | `mcp-tool-families.png` | Embed as `![Tool families](url)` |
| Inline (editor section) | `visual-editor.gif` | Embed inline; Dev.to renders GIFs natively. |
| Inline (approval-link section) | `approval-link-flow.gif` | This is the most engineering-interesting flow; show it inline in the technical post. |

**Dimensions:**
- Cover: 1000×420px (enforced crop). Design for this ratio — crop `demo-mcp-agent-loop.gif` to fit or create a static banner alternative.
- Inline images: 800px wide max to keep readable on mobile.

**Format:** PNG, GIF, JPEG. Dev.to CDN handles GIFs well.

---

### Medium

**Medium is image-in-line. The most clicked image is the first one after the headline (above the fold).**

| Use | Asset | Notes |
|---|---|---|
| First image (above fold) | `portal-overview.png` | A clean portal screenshot reads as "real product" to Medium's audience. |
| Second image | `company-brain-search.gif` | Demonstrates the AI angle the article is about. |
| Third image | `approval-link-flow.gif` | Engineering story: show the approval URL being returned and clicked. |
| Final image | `self-host-quickstart.gif` | End the article with the "try it yourself" path. |

**Dimensions:**
- Hero: 2:1 ratio (e.g. 1400×700). Medium's reader column is ~680px wide on desktop; supply 2x for retina.
- Inline: 1400px wide max (Medium's column will constrain it).

**Format:** PNG for stills, GIF for motion. Medium supports GIF. For smoother playback, you can host on Giphy or Imgur and embed the link — Medium will embed it natively.

---

## Recording setup checklist

Before capturing any asset from a running instance:

- [ ] Seed data loaded (`bun run db:seed:dev`) — real-looking demo records, not empty states
- [ ] Browser at 1440px wide for desktop captures, 375px for mobile preview shots in the editor
- [ ] Portal logged in as a demo client tenant (not the admin panel) for portal screenshots
- [ ] Browser chrome hidden or minimized where possible (use browser fullscreen / kiosk mode)
- [ ] OS notifications disabled
- [ ] Terminal font size legible at export dimensions (at least 14px rendered at capture scale)
- [ ] GIF frame rate 24 fps; loop count ≤ 3 to avoid motion sickness on auto-loop
- [ ] No real client data, real email addresses, or real API keys visible in any frame
