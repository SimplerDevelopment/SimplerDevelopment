# Feature Landing Page Spec — Surveys & Forms

---

## SEO Block

- **Title (≤60 chars):** Surveys & Forms with Branching Logic
- **Meta description (≤155 chars):** Multi-page forms with branching logic, scoring, CRM routing, post-submission email sequences, and a public results page — no third-party form tool needed.
- **Slug:** `/features/surveys-forms`
- **Primary keyword:** survey and form builder for agencies
- **Secondary keywords:** branching logic form builder, CRM-integrated survey tool, scored survey software, post-submission email sequence, white-label survey platform

---

## Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "SimplerDevelopment Surveys & Forms",
  "applicationCategory": "BusinessApplication",
  "featureList": [
    "Multi-page, multi-field forms",
    "Conditional branching logic",
    "Response scoring",
    "Automatic CRM deal creation on submission",
    "Post-submission email sequences",
    "File upload support",
    "Public aggregate results page",
    "AI-generated response summary",
    "Completion certificates",
    "Outbound webhook on submission"
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

**Headline:** Forms That Route Leads, Score Responses, and Trigger Follow-Ups Automatically

**Subhead:** Build multi-page surveys and intake forms with branching logic, connect them to your client's CRM, send post-submission email sequences, and publish aggregate results — all without a third-party form tool.

---

## Problem

Agencies build client intake forms in one tool, track responses in a spreadsheet, manually create CRM records from qualified leads, and configure follow-up emails in another platform. Each handoff is a potential failure point, and none of these tools are under the client's brand or inside the client's workflow.

---

## Solution

SimplerDevelopment's survey module gives each client a multi-page form builder that is wired into the rest of their portal. A form submission can automatically create a deal in the CRM, trigger a post-submission email sequence, post to a webhook, and record a scored result — all without any manual work after the form is published.

---

## Key Benefits

1. **Conditional branching logic.** Survey pages and fields can show or hide based on previous answers, so respondents only see questions relevant to them.
2. **Automatic CRM deal creation.** Qualifying submissions can be routed to the CRM as new deals without any manual step — the survey handles the handoff.
3. **Post-submission email sequences.** Configure automated follow-up emails that go out after a form is submitted — confirmation messages, recommendation results, or next-step instructions.
4. **Response scoring.** Each answer can carry a score value. The cumulative score is available for branching logic, email personalization, and display on a public recommendation engine.
5. **Public aggregate results and completion certificates.** A public results page at `/s/[slug]/results` shows aggregate response data. Respondents can receive a completion certificate on finish.

---

## How It Works

1. **Build the survey from a template or from scratch.** Six built-in templates cover common use cases (lead qualification, feedback, assessment, onboarding intake, and more). Add pages, fields, and branching rules in the survey editor.
2. **Configure submission actions.** Set up CRM routing (create a deal in a specific pipeline stage), post-submission email sequences, and outbound webhook targets.
3. **Publish and share.** The public form is live at a shareable URL (`yourdomain.com/s/your-slug`). It can also be embedded on any page via the block editor.
4. **Review responses and the AI summary.** The survey detail view in the portal shows individual responses, aggregate charts, and an AI-generated summary of the response set.

---

## FAQs

**Q: Can a form accept file uploads?**
A: Yes. File upload fields are supported and files are stored in the media library attached to the submission.

**Q: Is there a way to show results publicly to respondents?**
A: Yes. A public results page at `/s/[slug]/results` displays aggregate data. Whether it is visible is controlled per survey.

**Q: Can one survey have multiple variants for testing?**
A: The survey builder supports A/B variant configuration at the survey level. Each variant is its own form definition, enabling comparison of different question flows.

**Q: How does CRM routing work?**
A: On submission, the platform can create a CRM deal in a specified pipeline and stage. Fields from the form are mapped to contact and deal fields, creating the record automatically.

**Q: What triggers the post-submission email sequence?**
A: Completing the final page of the form triggers any configured email sequences. Sequences are configured in the survey detail view and use the platform's email infrastructure — no external automation tool is required.

---

## CTA

**Primary:** Build your first form today — [Start free trial]
**Secondary:** See branching logic in action — [Book a demo]

---

## Internal Links

- [AI Agent Platform](/features/ai-agent-platform) — manage surveys and retrieve responses via MCP tools (`surveys_*` family: `create`, `get`, `list`, `update`, `fork`, `list_responses`)
- [Email Campaigns](/features/email-campaigns) — connect post-submission sequences to the email campaigns module
- [Automations & Workflows](/features/automations-workflows) — trigger further automation rules on survey completion
- Developer reference: [docs/agents/tool-reference.md](../../docs/agents/tool-reference.md) — `surveys_*` tool family

---

## Media Requirements

- **Screenshot:** Survey editor showing a multi-page form with a branching rule configured — "if answer to Q2 is X, skip to page 3."
- **Screenshot:** Submission routing settings — CRM pipeline selector and email sequence list.
- **Screenshot:** Public survey form on a branded domain (mobile viewport preferred).
- **Screenshot:** Survey responses view — response list with per-response scores.
- **Screenshot:** AI summary panel showing generated insights from the response set.
- **GIF:** Building a branching survey — adding a conditional page rule and previewing the skip logic in the flow diagram (approx. 15 seconds).

---

## Status Notes (internal — omit from published page)

- `maxResponses` gate has a documented race condition — do not market "enforce a hard response cap" as a precision guarantee.
- Webhook dispatcher is fire-and-forget (no guaranteed delivery). Do not market "reliable webhook delivery with retries."
- Survey A/B variants are a feature of the survey domain's own variant UI, separate from the site-level A/B experiment engine.
