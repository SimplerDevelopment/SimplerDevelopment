# Feature Landing Page Spec — Pitch Decks

---

## SEO Block

- **Title (≤60 chars):** Pitch Deck Builder with AI Slide Generation
- **Meta description (≤155 chars):** Create investor decks, proposals, and sales presentations with an AI-assisted block editor — then share them from your own domain.
- **Slug:** `/features/pitch-decks`
- **Primary keyword:** pitch deck builder for agencies
- **Secondary keywords:** AI slide generation, investor deck tool, sales presentation software, collaborative presentation builder, interactive sales deck

---

## Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "SimplerDevelopment Pitch Decks",
  "applicationCategory": "BusinessApplication",
  "featureList": [
    "AI-assisted slide generation and regeneration",
    "Block-based slide editor",
    "Version history with restore",
    "Multi-user real-time collaboration",
    "Branching decision slides for interactive sales decks",
    "HTML slide upload",
    "Three public viewer URL schemes",
    "Presenter mode"
  ],
  "offers": {
    "@type": "Offer",
    "description": "Per-tenant module subscription"
  }
}
```

Additional applicable type: `FAQPage` (see FAQs section below).

---

## Hero

**Headline:** Build, Collaborate On, and Share Pitch Decks Without Leaving the Client Portal

**Subhead:** An AI-assisted block editor for investor decks, sales presentations, and proposals — with real-time co-editing, version history, and a shareable public viewer on your client's domain.

---

## Problem

Agencies and their clients build pitch decks in a design tool, share them as PDFs or third-party links, and lose track of which version was sent to whom. Revisions require round-tripping back to the design tool and redistributing. There is no live viewer the client controls, no version history, and no way for multiple people to edit simultaneously without conflicts.

---

## Solution

SimplerDevelopment's pitch deck module brings the whole presentation workflow into the client portal. AI generates an initial slide structure from a brief. The block editor makes per-slide edits straightforward. Multiple collaborators can edit at the same time via real-time presence. Every published version is preserved in history and can be restored. The finished deck is shared from a URL on the client's domain — no third-party link required.

---

## Key Benefits

1. **AI slide generation.** Provide a brief and the AI generates an initial slide set. Individual slides can also be regenerated independently when the content needs a refresh.
2. **Block-based editing with a live theme panel.** Slides are built from the same typed block components used for website pages, with a theme panel, SEO settings, and a batch-edit mode for changes that span all slides.
3. **Real-time multi-user collaboration.** Multiple editors can work on the same deck simultaneously with presence indicators — no merge conflicts, no file locking.
4. **Version history with restore.** Every published state is recorded. Any prior version can be reviewed and restored from the history panel.
5. **Branching decision slides for interactive presentations.** Sales decks can include decision-point slides that let the viewer choose a path through the content — building interactive flows without custom development.

---

## How It Works

1. **Create a deck from the portal.** Use the new deck wizard to name the deck and provide a brief. The AI generates an initial slide structure, or start with a blank deck and add slides manually.
2. **Edit slides in the block editor.** Add and rearrange blocks within each slide. Use the theme panel for typography and color settings. Regenerate any slide with the AI regenerate modal when the draft isn't right.
3. **Collaborate and revise.** Invite collaborators — they see real-time cursor presence. Use the history panel to review or restore any prior published state.
4. **Publish and share.** Publish the deck. It becomes available at a URL on the client's domain (or a global viewer URL). Share the link directly.

---

## FAQs

**Q: Can an existing HTML presentation be imported?**
A: Yes. The deck editor supports uploading an HTML file or a ZIP of HTML slides, which are converted into the deck's block format for continued editing.

**Q: How many people can collaborate on a deck at once?**
A: Real-time collaboration is handled by a Yjs WebSocket server. There is no hard cap enforced in the product — practical limits are determined by the hosting configuration.

**Q: What URL does the shared deck use?**
A: Three viewer schemes are available: a global viewer (`/slides/[slug]`), an alternate viewer (`/pitch-deck/[slug]`), and a site-scoped viewer (`yourdomain.com/slides/[slug]`). The site-scoped viewer appears on the client's own domain.

**Q: Can a deck be forked for a different client or use case?**
A: Yes. The `fork` action creates an independent copy of any deck. The original is preserved.

**Q: Is there a presenter mode?**
A: Yes. A full-screen presenter mode is available from the deck editor, suitable for live presentations directly from the portal.

---

## CTA

**Primary:** Start building presentations — [Start free trial]
**Secondary:** See the editor in action — [Book a demo]

---

## Internal Links

- [AI Agent Platform](/features/ai-agent-platform) — manage decks via MCP tools (`decks_*` family: 13 tools including `create`, `add_slide`, `replace_slides`, `upload_html`, `publish_all`)
- [Surveys & Forms](/features/surveys-forms) — embed survey links inside a deck for post-presentation lead capture
- [CRM](#) — link a pitch deck to a CRM deal as an artifact
- Developer reference: [docs/agents/tool-reference.md](../../docs/agents/tool-reference.md) — `decks_*` tool family

---

## Media Requirements

- **Screenshot:** Deck editor — slide list on the left, slide canvas in the center, theme panel on the right.
- **Screenshot:** AI regenerate modal — brief input field and the "regenerate this slide" action.
- **Screenshot:** Version history panel with multiple prior versions listed and a restore button.
- **Screenshot:** Public viewer on a branded domain — clean slide view with navigation controls.
- **Screenshot:** Multi-user presence bar showing two collaborators active in the editor.
- **GIF:** Branching decision slide in the public viewer — viewer clicks a choice button and the deck advances to the corresponding slide path (approx. 10 seconds).

---

## Status Notes (internal — omit from published page)

- A/B testing (`applyAbToDeckSlides`) is implemented in the codebase but is not called on the public deck render paths. Do not market deck A/B testing as a live feature.
- Decision/branching slides are built and functional in the editor and viewer — safe to feature.
- Voice assistant integration is dormant — not mounted, do not mention.
