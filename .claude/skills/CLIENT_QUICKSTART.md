# Connect Claude to Your SimplerDevelopment Portal

A 10-minute quickstart for portal users who want Claude to draft pages, decks, emails, surveys, booking pages, and full websites directly into their SimplerDevelopment tenant.

**Who this is for:** SimplerDevelopment portal customers using Claude Desktop or Claude Code. You don't need to know anything about how the portal is built — just your tenant URL and the email/password you log in with.

---

## 1. What you'll be able to do

Once connected, you can ask Claude things like:

- "Draft a landing page for our spring promotion."
- "Build a 3-page funnel site for the new product, with a qualifier survey and a discovery-call booking page."
- "Write a welcome email for new subscribers."
- "Create an NPS survey for customers who completed onboarding."
- "Take this PDF brief and turn it into a pitch deck."

Everything Claude creates is a **draft**. Nothing goes live until you (or a reviewer you forward the link to) clicks **Approve** on a one-time review URL.

---

## 2. Prerequisites

- An active SimplerDevelopment portal account with an admin or editor role on at least one site.
- Your tenant subdomain — typically `https://<your-tenant>.simplerdevelopment.com`. (Your account manager can confirm.)
- One of the supported Claude clients:
  - **Claude Desktop** (Mac or Windows), or
  - **Claude Code** CLI, or
  - **claude.ai** with custom connectors enabled.

---

## 3. Install the skills bundle (one-time)

The skills (`sd-init`, `sd-create-page`, `sd-create-deck`, …) are short Markdown
prompt files that live under `~/.claude/skills/` on your machine. Claude
Desktop and Claude Code read them automatically once they're in place.

Open the installer page and click the button for your OS:

**[https://simplerdevelopment.com/install](https://simplerdevelopment.com/install)**

- **macOS:** downloads `install-sd-skills.command`. Double-click in Finder.
  (First run only: right-click → Open to bypass Gatekeeper, since the
  installer isn't code-signed yet.)
- **Windows:** downloads `install-sd-skills.bat`. Double-click in Explorer.
  (First run only: click "More info" → "Run anyway" if SmartScreen prompts.)
- **Linux / manual:** one curl line —
  ```bash
  mkdir -p ~/.claude/skills && \
    curl -fsSL https://simplerdevelopment.com/api/skills/bundle \
    | tar -xz -C ~/.claude/skills
  ```

Each installer downloads the latest bundle (~45 KB), verifies the SHA-256
checksum, and extracts to `~/.claude/skills/`. No admin rights needed; the
installer never writes outside your home directory.

After install you should see `~/.claude/skills/sd-init/`,
`~/.claude/skills/sd-create-page/`, and the rest — plus
`SD_DESIGN_PRINCIPLES.md` and a copy of this quickstart for offline reference.

To upgrade later (when new skills ship), re-run the installer. It overwrites
the bundle contents safely.

---

## 4. Connect Claude to your portal

The portal exposes an MCP (Model Context Protocol) endpoint at `https://<your-tenant>.simplerdevelopment.com/api/mcp`. Connecting it to Claude is a one-time configuration.

### Claude Desktop

1. Open **Settings → Developer → Edit Config** (or open `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS).
2. Add an MCP server entry under `mcpServers`:

   ```json
   {
     "mcpServers": {
       "simplerdevelopment": {
         "command": "npx",
         "args": [
           "-y",
           "mcp-remote",
           "https://<your-tenant>.simplerdevelopment.com/api/mcp"
         ]
       }
     }
   }
   ```

3. Save and restart Claude Desktop. The first time you use a SimplerDevelopment tool, Claude will open a browser to authorize — log in with your portal credentials, pick which tenant to authorize, and click **Approve**.

### Claude Code

```bash
claude mcp add simplerdevelopment \
  -- npx -y mcp-remote https://<your-tenant>.simplerdevelopment.com/api/mcp
```

Then in any Claude Code session, the SD tools are available as `mcp__simplerdevelopment__*`.

> If the browser doesn't open automatically, copy the authorization URL Claude prints into your browser manually.

---

## 5. One-time bootstrap

In your first Claude session against the portal, run:

```
/sd-init
```

This:

1. Verifies you're authenticated and shows which tenant / sites you have access to.
2. Picks your default site (or asks if you have multiple).
3. Pulls your brand profile — logos, colors, fonts, tone of voice, value proposition.
4. Runs a contrast audit on your brand colors and flags any combinations that fail WCAG.
5. Lists every block template and email template your tenant already has, so Claude reuses them instead of inventing new ones.
6. Writes a small `.sd/config.json` in your project folder. Re-run `/sd-init` any time you switch tenants or update your brand profile.

You only do this once per project folder. After that, every other skill picks up the config automatically.

---

## 6. Common flows

### Draft a landing page

```
/sd-create-page  Draft a landing page for our spring offer. Hero, three feature blocks, social proof, CTA to /book/discovery-call.
```

Claude returns the post id and a **public approval URL**. Open it (or share with a stakeholder) → click **Approve** → the page goes live on your site.

### Draft an email campaign

```
/sd-create-email  Welcome email for the "early-access" list. Friendly tone, link to /tour and /book/onboarding.
```

Claude creates the campaign as a draft and returns an approval URL. **Approval marks the campaign ready, but does not send.** When you're ready to ship, run:

```
Send campaign 42.
```

### Build a multi-page site

```
/sd-create-website  Build a 4-page funnel for the consulting practice: homepage, services, qualifier survey, contact with booking widget.
```

Claude plans the sitemap, drafts every page, wires the top navigation, embeds a qualifier survey on the funnel page and the discovery-call booking on the contact page, and returns one bundled response with every approval URL.

### Create a survey

```
/sd-create-survey  NPS survey for customers 30 days after their first booking. Include a follow-up "what would have made it a 10?" if score ≤ 7.
```

Returns the survey id, the public `/s/<slug>` URL, and an approval URL. Approving flips the survey from `draft` to `active` so responses start being accepted.

### Capture feedback so Claude doesn't repeat mistakes

```
/sd-learn  On the last page we wanted shorter hero subtitles. Save that for next time.
```

This writes a per-project rule into `.sd/learnings.md`. Every subsequent skill consults it before authoring.

---

## 7. The approval URL — what it is and how to use it

Every create / update returns an approval URL shaped like:

```
https://<your-tenant>.simplerdevelopment.com/approve/<64-hex-token>
```

- **Anyone with the link** can open it in a browser, see the preview, and click **Approve** or **Reject**. No portal login required — handy for getting stakeholder sign-off without provisioning seats.
- Tokens expire 14 days after they're minted, by default. After that, ask Claude for a fresh link with `Re-share the approval URL for post 123`.
- Once **approved**, the action is permanent: the page publishes, the survey activates, the booking page goes live, the deck slides promote. Rejecting leaves the entity untouched.
- Every edit Claude makes mints a **fresh** approval URL. The previous URL stays in whatever state it was in (pending / approved / rejected) and stops being the live one. Always use the most recent URL Claude gives you.

---

## 8. Troubleshooting

- **Auth fails after I pick a tenant.** Re-run the OAuth flow — sometimes the browser closes before the callback completes. Restart Claude Desktop, then trigger any SD tool.
- **`whoami` returns the wrong tenant.** On the consent page, the dropdown picks the active tenant — make sure you've selected the right one before clicking **Authorize**.
- **`sd-init` complains about a missing brand profile.** Ask Claude to create one with your company name and primary color, or set one up at `https://<your-tenant>.simplerdevelopment.com/portal/brand`.
- **A page looks generic / off-brand.** Your brand profile's `valueProposition`, `keyDifferentiators`, and `toneOfVoice` are sparse. Fill them in via the portal, then re-run `sd-init` to refresh the snapshot Claude reads from.
- **Approval URL says "expired."** Tokens last 14 days. Ask Claude to mint a fresh one with `Re-share the approval URL for <entity>`.
- **"Pending change" instead of immediate publish.** Your API key has `require_cms_approval=true` — every mutation is staged until a reviewer approves it. That's intentional for controlled environments. Reach out to your account manager to flip the flag if you don't want this behavior.

---

## 9. What's available right now

| Skill | What it drafts |
|---|---|
| `sd-init` | One-time setup. |
| `sd-create-page` | Landing pages, blog posts, marketing pages. |
| `sd-create-deck` | Pitch decks, sales decks, investor decks. |
| `sd-create-email` | Campaign emails (announcement, newsletter, nurture, welcome). |
| `sd-create-survey` | Surveys, intake forms, NPS, qualification quizzes. |
| `sd-create-booking-page` | Booking pages (Calendly-style) — create new or embed existing. |
| `sd-create-website` | Composes a full multi-page site with top-nav and embedded widgets. |
| `sd-build-html-embed` | Custom HTML / interactive widgets uploaded as draft pages or 1-slide decks. |
| `sd-learn` | Capture per-project feedback so Claude inherits your preferences. |
| `html-render-block` | Edit `html-render` block JSON exported from the portal. |

---

## 10. Questions or stuck?

Email your SimplerDevelopment account manager with:
- The approval URL or post / deck / campaign id you were working on.
- A copy of the Claude response (or screenshot).
- Your tenant subdomain.

We can debug from the artifact id without needing access to your Claude session.
