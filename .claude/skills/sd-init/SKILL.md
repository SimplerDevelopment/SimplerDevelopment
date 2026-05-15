---
name: sd-init
description: One-shot bootstrap for working with the SimplerDevelopment portal MCP. Verifies auth, surfaces the active client + brand profile, lists existing block_templates and email_templates so future skills can compose from them, and writes `.sd/config.json` (default brand profile id, default site id, brand snapshot) so sibling skills like sd-create-page / sd-create-deck / sd-create-email don't have to re-discover the tenant on every run. Use when the user says 'sd init', 'set up SD', 'connect to SimplerDevelopment', 'configure my SD workspace', 'bootstrap SimplerDev', or starts a fresh project that will produce content via the SD MCP. Idempotent — safe to re-run to refresh the snapshot.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob
---

# sd-init

One-shot setup for SimplerDevelopment portal MCP work. Run once per project; it's idempotent. Writes `.sd/config.json` so every later content skill (`sd-create-page`, `sd-create-deck`, `sd-create-email`) starts knowing which client, brand profile, and site it's operating against.

## What this skill does

1. **Verify MCP auth.** Calls `mcp__simplerdevelopment-postcaptain__whoami`. If unauthenticated, walk the user through adding the SD MCP server in their Claude Code config or claude.ai connector. Stop until auth works — every other step depends on it.

2. **Resolve the active client + sites.** Call `mcp__simplerdevelopment-postcaptain__client_get` and `mcp__simplerdevelopment-postcaptain__sites_list`. If there's exactly one site, default to it. If there are multiple, ask the user which site is the "active" one for this project. Record both `clientId` and `defaultSiteId`.

3. **Resolve the default branding profile.** Call `mcp__simplerdevelopment-postcaptain__branding_list_profiles`. Pick the one with `isDefault: true`. If none exists, offer to create one with `mcp__simplerdevelopment-postcaptain__branding_create_profile` using whatever the user can give you (company name + primary color is the absolute minimum). If the user wants to skip this, don't proceed — every later content skill defaults to this profile, and skipping it leads to off-brand output.

4. **Pull the brand messaging snapshot.** Call `mcp__simplerdevelopment-postcaptain__branding_get_messaging` for the resolved profile. Capture: companyName, tagline, valueProposition, toneOfVoice, brandPersonality, keyDifferentiators, targetAudience, elevatorPitch, boilerplate. This is the source material future skills lean on; if any of those are empty, flag to the user with a one-line "your brand voice is sparse, content quality will suffer" warning — don't fix it inline (that's a separate workflow).

5. **Pull the logo + asset snapshot.** From the same `branding_get_profile` response, capture the logo URLs: `logoUrl` (wide), `logoSquareUrl`, `logoRectUrl`, `logoIconUrl`, `logoText`, `logoAlt`. Skills under `sd-create-*` use these by default to brand every artifact they produce. If `logoUrl` is null, surface explicitly: "no wide logo on the brand profile — content will fall back to the wordmark; upload via `branding_update_profile` to elevate."

6. **Audit contrast.** Call `branding_check_contrast` for the brand pairs that will appear on every artifact:
   - `textColor` vs `backgroundColor` (body)
   - white (`#FFFFFF`) vs `primaryColor` (typical CTA)
   - white (`#FFFFFF`) vs `accentColor` (alternate CTA)

   Record the WCAG ratios in `.sd/config.json:brand.contrast`. If any pair fails 4.5:1 for body text or 3:1 for large/UI text, flag it — the failing pair becomes a `learnings.md` rule ("never put white on accent — fails contrast; use near-black instead").

5. **Inventory reusable assets.**
   - `mcp__simplerdevelopment-postcaptain__block_templates_list` — record `{ id, name, slug, category, scope }` for every published template.
   - `mcp__simplerdevelopment-postcaptain__email_templates_list` — record `{ id, name, category }` for every email template.
   - Note which categories are present (hero, cta, footer, testimonials, etc.) and which are missing — the create skills check this list before inventing new blocks from scratch.

6. **Seed the starter library (only if asked).** If the user explicitly says "set me up" or "seed templates", offer to create a starter pack:
   - Block templates: hero, three-column feature grid, CTA band, testimonial, pricing tier, footer.
   - Email templates: welcome, announcement, newsletter.
   - Deck theme: cover, content, section break, closing (as `scope: block` templates that future deck skills can pull in).
   Each creation uses `*_create` with the resolved brand profile applied. **Don't seed silently** — list what you'd create and confirm.

7. **Bootstrap `.sd/learnings.md`** if it doesn't already exist. Use the template from the `sd-learn` skill (canonical header + `## Active rules` + `## Artifact log` sections, no entries yet). Skills under `sd-create-*` will read this file on every run to pick up accumulated user feedback.

8. **Write `.sd/config.json`** in the working directory. Shape:

   ```json
   {
     "version": 1,
     "generatedAt": "2026-05-14T...",
     "client": { "id": 123, "name": "..." },
     "defaultSiteId": 456,
     "brand": {
       "profileId": 789,
       "profileName": "Default",
       "primaryColor": "#0F172A",
       "secondaryColor": "#2563EB",
       "accentColor": "#06B6D4",
       "backgroundColor": "#FFFFFF",
       "textColor": "#0F172A",
       "headingFont": "Inter",
       "bodyFont": "Inter",
       "logos": {
         "logoUrl": "...",
         "logoSquareUrl": "...",
         "logoRectUrl": "...",
         "logoIconUrl": "...",
         "logoText": "...",
         "logoAlt": "..."
       },
       "contrast": {
         "bodyOnBg": 12.6,
         "whiteOnPrimary": 16.1,
         "whiteOnAccent": 2.8,
         "warnings": ["whiteOnAccent fails WCAG-AA (need 4.5, got 2.8) — never use white text on accentColor; use textColor instead"]
       },
       "messaging": {
         "companyName": "...",
         "tagline": "...",
         "toneOfVoice": "...",
         "valueProposition": "...",
         "keyDifferentiators": ["..."],
         "targetAudience": "..."
       }
     },
     "inventory": {
       "blockTemplates": [{ "id": 1, "slug": "hero-default", "category": "section" }],
       "emailTemplates": [{ "id": 1, "name": "Welcome", "category": "welcome" }]
     }
   }
   ```

   Future skills read this file first so they don't burn tokens re-fetching every run. If it's stale (>14 days), they'll re-call `whoami` to verify and refresh.

## When to re-run

- New site added to the client → refresh `inventory` + `defaultSiteId`.
- Brand messaging updated → refresh `brand.messaging`.
- New block_templates seeded → refresh `inventory.blockTemplates`.
- API key rotated → re-verify auth.

Re-running with no flag does the full pass and overwrites `.sd/config.json`. Pass `--refresh-inventory` to skip the auth/brand prompts and only re-pull the template lists.

## Inputs to ask

Only ask if these can't be auto-resolved:

1. **Which site** is active (if `sites_list` returns more than one and there's no obvious match).
2. **Should I create a default brand profile** (if none exists). Default to "no, you do this in the portal first" unless the user pushes.
3. **Should I seed the starter library** (only if the user asked to "set up everything"). Default to "no" — most projects already have templates.

## Failure modes

- **whoami returns 401** → MCP server isn't connected. Show the connect-MCP instructions for Claude Code and stop.
- **No default brand profile + user declines to create one** → write `.sd/config.json` with `brand: null` and warn that content skills will use the SimplerDev house defaults instead of a tenant brand.
- **Tenant has 0 sites** → most likely a setup error in the portal. Stop and tell the user to create at least one site in `/portal/websites` before running this skill.

## Output

A `.sd/config.json` file plus a 5-line summary printed to the user:
- Client name + id
- Active site name + id
- Brand profile name + key tone descriptors
- Number of block templates + email templates discovered
- Whether starter library was seeded

## Install

Local install (per-machine, not committed):

```bash
ln -s "$(pwd)/.claude/skills/sd-init" ~/.claude/skills/sd-init
```
