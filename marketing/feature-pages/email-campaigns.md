# Feature Landing Page Spec — Email Campaigns

---

## SEO Block

- **Title (≤60 chars):** Email Campaign Tools for Digital Agencies
- **Meta description (≤155 chars):** Build subscriber lists, create HTML campaigns, test subject lines, and track opens and clicks — all within your client's portal.
- **Slug:** `/features/email-campaigns`
- **Primary keyword:** email marketing for agencies
- **Secondary keywords:** subscriber list management, HTML email builder, email open tracking, segmented email campaigns, white-label email marketing platform

---

## Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "SimplerDevelopment Email Campaigns",
  "applicationCategory": "BusinessApplication",
  "featureList": [
    "Drag-and-drop block email builder",
    "Subscriber list management with segmentation",
    "A/B subject line testing",
    "Open, click, and bounce tracking",
    "HTML template library",
    "Campaign forking and reuse",
    "Transactional email customization per site"
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

**Headline:** Email Marketing That Lives Inside Your Client's Portal

**Subhead:** Subscriber lists, segmentation, a block-based campaign builder, A/B subject line testing, and open/click/bounce analytics — all branded to your client and managed without a separate email platform login.

---

## Problem

Agencies managing email marketing for clients bounce between the client's ESP login, a spreadsheet of subscribers, and a design tool for templates. Every new client is another account to provision, another set of credentials to share, and another dashboard to monitor. There is no single place where the client can see their own list, build their own campaigns, and read their own analytics.

---

## Solution

SimplerDevelopment gives every client an email module inside their portal. They can build campaigns with the same block editor used for their website pages, manage their subscriber lists and segments in one place, test subject lines with built-in A/B configuration, and track results in a per-campaign analytics view. Outbound delivery runs through Resend with open, click, and bounce tracking. The agency never needs to hand clients access to a third-party ESP.

---

## Key Benefits

1. **Block-based campaign builder.** The same 47+ block types used for website pages are available in the email builder — text, images, buttons, dividers, and more — with a preview that renders the email as it will appear in an inbox.
2. **Subscriber list management with segmentation.** Clients manage their lists directly in the portal. Segments can be created to filter subscribers by attributes, enabling targeted sends to specific audience groups.
3. **A/B subject line testing.** The campaign builder has a built-in A/B configuration panel for testing subject line variants within a single campaign, without needing a separate testing tool.
4. **Open, click, and bounce tracking.** Per-campaign analytics surface delivery, open, and click metrics. Bounced addresses are tracked at the infrastructure level via Resend.
5. **Template library and campaign forking.** Clients can save reusable HTML templates and fork any past campaign into a new draft — useful for recurring newsletters and event announcements.

---

## How It Works

1. **Build and manage subscriber lists.** Import subscribers or collect them via forms. Create segments to target specific groups based on subscriber attributes.
2. **Draft a campaign in the block editor.** Pick a template or start from scratch. Add blocks, configure A/B subject line variants if needed, and preview the email before sending.
3. **Review and send.** Live-content send actions route through an approval step — a reviewer confirms the campaign before it goes out — then Resend delivers it to the list.
4. **Monitor results.** The analytics tab shows delivery, open rate, click rate, and bounce summary per campaign.

---

## FAQs

**Q: Does each client get their own sending domain?**
A: Yes. Each client configures their own sending domain and from-address in the portal's email settings. The agency admin can also manage sending domains from the admin panel.

**Q: Can transactional emails (booking confirmations, order receipts) be customized?**
A: Yes. Per-site transactional email templates — for bookings, orders, invitations, and other system-triggered events — are customizable in the portal independently of marketing campaigns.

**Q: Are subscriber lists isolated between clients?**
A: Yes. Subscriber lists, segments, and campaign data are fully isolated per tenant. One client cannot see or affect another client's list.

**Q: Can we reuse a campaign layout across multiple sends?**
A: Yes. Any campaign can be forked into a new draft. HTML templates saved to the template library are available to reuse as the starting point for new campaigns.

**Q: What email provider handles delivery?**
A: Outbound delivery uses Resend. The agency configures the Resend integration; clients interact with sending domains and from-addresses from within the portal without needing a Resend account of their own.

---

## CTA

**Primary:** Add email marketing to your client portal — [Start free trial]
**Secondary:** See the campaign builder — [Book a demo]

---

## Internal Links

- [AI Agent Platform](/features/ai-agent-platform) — manage campaigns, lists, and subscribers via MCP tools (`email_*` family, 20 tools)
- [Surveys & Forms](/features/surveys-forms) — pair survey responses with targeted email follow-up sequences
- [Automations & Workflows](/features/automations-workflows) — trigger campaign sends or list updates from automation rules
- Developer reference: [docs/agents/tool-reference.md](../../docs/agents/tool-reference.md) — `email_*` tool family

---

## Media Requirements

- **Screenshot:** Campaign list view with status badges (draft, sent, archived).
- **Screenshot:** Block-based campaign builder with a real campaign body — text block, image block, button — and the right-hand block settings panel visible.
- **Screenshot:** A/B subject line configuration panel inside the campaign builder.
- **Screenshot:** Per-campaign analytics view — delivery count, open rate, click rate.
- **Screenshot:** Subscriber list view with segment filter applied.
- **GIF:** Creating a new campaign — picking a template → adding a block → configuring a subject line → preview (approx. 20 seconds).

---

## Status Notes (internal — omit from published page)

- Scheduled campaigns: the UI supports setting a campaign to "scheduled" status but there is no automated dispatcher cron in the current release. Do not market "automatically send at a future date/time" until the cron dispatcher is shipped. Use "configure and send when ready" language instead.
- Soft-bounce suppression (auto-unsub after N bounces) is not yet built — omit from feature claims.
- Email A/B is a campaign-builder-level feature separate from the site-level A/B experiment engine; it is real and usable but is distinct from the `lib/ab/` experiments module.
