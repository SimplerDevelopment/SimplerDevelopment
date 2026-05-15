---
name: sd-create-email
description: Draft an email campaign (announcement, newsletter, nurture, welcome) in the SimplerDevelopment portal via the postcaptain MCP. Produces a campaign tied to an email list, applying the default brand profile, optionally composing from existing email_templates, and returns a shareable approval URL so the author can hand it to a stakeholder for content review BEFORE the campaign ships. Approval records a "ready" stamp but does NOT auto-send — the actual send is a separate explicit action (email_campaigns_send). Sourcing material is OPTIONAL and user-driven — the skill asks where to pull from if unclear (postcaptain-kb, an external URL, a pasted brief, or just the user's prompt). Use when the user says 'draft an email about X', 'create a campaign for Y', 'write a newsletter on Z', 'announcement email for W', 'nurture email'. Default mode publishes a DRAFT (`status: draft`); requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, WebFetch, Glob, Grep
---

# sd-create-email

Draft an email campaign in the portal. The campaign is created in draft status, the approval link is minted, and the URL is handed back so the author can share it for review.

**Important:** "Approve" on the link records a "ready to ship" stamp. It does NOT send the email. Sending is a separate deliberate action (`email_campaigns_send`) — the author triggers it after approval.

## Pre-flight

1. **Read `.sd/config.json`** — confirm `client`, `defaultSiteId`, `brand`. Run `sd-init` first if missing.
2. **Read brand messaging** — emails lean heavily on `toneOfVoice`, `valueProposition`, `keyDifferentiators`, `boilerplate`.
3. **Read `SD_DESIGN_PRINCIPLES.md`** — section 9 has the email-specific tweaks (`<table>` layouts, inline styles, max-width 600px, 16px body, max 40px logo height).
4. **Read `.sd/learnings.md`** if present — apply `## Active rules`. Pay extra attention to email-specific rules since deliverability gotchas accumulate fast (e.g. "client X doesn't want emoji in subject lines," "campaigns to list Y always go from hello@, not the personal address").
5. **Identify the target list.** Ask the user which list the campaign goes to. List candidates with `mcp__simplerdevelopment-postcaptain__email_lists` (or `email_lists_create` for a brand-new list). Record `listId` — required for `email_campaigns_create`.
6. **From-address sanity.** Resolve `fromName` and `fromEmail`. Prefer ones the tenant has already used in past campaigns (check `email_campaigns_list`). For a new tenant, ask explicitly — getting this wrong can land the campaign in spam.

## Sourcing — ASK if unclear

Same options as `sd-create-page`:

- **`prompt-only`** — write from prompt + brand voice (most common for nurture / short announcement emails).
- **`postcaptain-kb`** — mine the postcaptain-kb vault. For SD-internal sends (newsletters, capability announcements).
- **`url`** — fetch one or more URLs (e.g. announcement blog post, case study) and structure the email around it.
- **`brief`** — read a local markdown/txt brief.
- **`mixed`** — combine.

**Do not silently use postcaptain-kb for client emails.** Flag if `client.id` is not the SD agency client and the user picked an SD-internal source.

## Authoring

1. **Reuse before invent.** Check `.sd/config.json:inventory.emailTemplates` for templates that match the campaign type (welcome, announcement, newsletter, transactional). If a template matches, use it as the starting point — pull the template's `htmlContent` or `blockContent`, customize, and pass through.

2. **Email block discipline.** Email rendering is constrained vs web rendering. Stick to:
   - `text`, `heading`, `image`, `button`, `divider`, `spacer` — universal.
   - `columns` (2-col max for mobile compatibility).
   - `email-header`, `email-footer` — reuse if the brand has these templates.
   - **Avoid** complex visual-editor blocks (tabs, accordion, marquee, video, embedded HTML beyond what `renderBlocksToEmailHtml` supports).

3. **Subject + preview text.**
   - **Subject:** 30–50 chars. Lead with the value/news, not a brand prefix.
   - **Preview text:** 80–110 chars. Should complement the subject, not repeat it. Many inboxes show this preview alongside the subject.

4. **Body shape.** Most well-performing campaign types follow a common spine:
   - **Announcement:** header → hero (image + 1-line headline) → body (2-3 short paragraphs) → CTA button → footer.
   - **Newsletter:** header → 2-4 sections (each with eyebrow + heading + 2-3 lines + read-more link) → footer.
   - **Welcome:** header → personalized greeting → 2-3 onboarding steps → CTA → footer.
   - **Nurture:** header → contextual hook → 1 short value section → soft CTA → footer.

5. **Brand voice.** As with pages — `toneOfVoice`, `brandPersonality`, `writingStyle` set register; `valueProposition` and `keyDifferentiators` anchor the content. **Skip the corporate-voice phrasing** unless the brand explicitly calls for it.

6. **Logo in the header.** From `.sd/config.json:brand.logos.logoUrl`, place the wide logo as the first row of the email. Constraints:
   - Image element, NOT base64 (Gmail/Outlook block data: URIs in email).
   - `max-height: 40px` — bigger reads as amateur.
   - Center-align on dark headers, left-align on light headers.
   - `alt` text from `logos.logoAlt` or `<companyName> logo`.

   If `logoUrl` is null, use the styled wordmark variant of `logoText` in the brand accent color.

7. **Footer.** Always include unsubscribe (the renderer injects `{{UNSUBSCRIBE_URL}}`). Include the company wordmark + a one-line address ("simplerdevelopment.com" or the physical address from the brand profile). Light-on-dark or dark-on-light — match the header's pattern.

8. **Run the email-specific contrast check.** All body text and button labels must pass 4.5:1. Buttons commonly fail when the background uses the brand `accentColor` — call `branding_check_contrast` for `button.style.color` vs `button.style.backgroundColor` and adjust if it fails.

9. **Link related artifacts.** Common patterns:
   - **CTA to a booking page** — `button` block whose `url` is the absolute booking URL: `https://<site-domain>/book/<slug>`. (Email links MUST be absolute.) Pair with a secondary "or reply to this email" inline link.
   - **Link to a survey** — same pattern, `https://<site-domain>/s/<survey-slug>`.
   - **Link to a CMS page** — same pattern. Always absolute.

   Don't try to embed the survey or booking widget directly in an email — email clients don't run React. Always link out.

## MCP call

Call `mcp__simplerdevelopment-postcaptain__email_campaigns_create` with:

```json
{
  "name": "<internal name, e.g. 'Q2-2026 Product Announcement'>",
  "subject": "<email subject line>",
  "previewText": "<preview text>",
  "fromName": "<from name>",
  "fromEmail": "<verified from-address>",
  "replyTo": "<optional reply-to>",
  "listId": <list id>,
  "blocks": [...]
}
```

Pass `blocks` (preferred — server renders to HTML using `renderBlocksToEmailHtml`) OR `htmlContent` (pre-rendered). Not both.

`status` is forced to `draft` at create time — you cannot start a campaign in any other state.

## Output

The MCP response includes an `approval` envelope. Return to the user:
- Campaign id + portal URL: `/portal/email/campaigns/<id>`
- Recipient count (read via `email_lists` for `subscriberCount` on the listId)
- **Approval URL** — this is what the user shares for review
- A one-line summary of the campaign (subject + body shape + CTA)
- **A reminder that approval does NOT auto-send** — the user runs `email_campaigns_send` or schedules via the portal after the link is approved.

## Iteration

- Edit copy → call `email_campaigns_update` with the same id. **Each update mints a fresh approval URL** so the reviewer sees the content as-of-mint-time. Old URL stays in its current state; new URL supersedes. Return the new one to the user.
- A/B subject test → set `abEnabled: true`, `abSubjectB: "<variant>"` on update. The approval previewer renders the primary subject — note the A/B variant in the review or share it as a comment.
- Major rework → call `email_campaigns_fork` for a clean variant with its own approval link. Fork resets `status='draft'` and zeroes send counts — never touches the parent.

## Failure modes

- **No `.sd/config.json`** → run `sd-init` first.
- **`fromEmail` not verified** → Resend will reject the send when the user later calls `email_campaigns_send`. The skill can't detect this; flag in the output ("verify the from-address in the portal before send").
- **Subscription not active** → `email_campaigns_create` will return "This feature requires an active email subscription". Surface to user.
- **`status` is not draft** when calling update → the update tool refuses. If the campaign already sent, the user needs to fork it.
- **Pending approval gate** → `email_campaigns_create` returns `pending: true` if the API key has `require_cms_approval`. The campaign isn't created until the staged change is approved through the same approval URL.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-create-email" ~/.claude/skills/sd-create-email
```
