# SimplerDevelopment Content Skills — Morning Brief

Read this in 60 seconds. Then jump into the full runbook at
[`.claude/skills/SD_SKILLS_RUNBOOK.md`](./SD_SKILLS_RUNBOOK.md).

---

## TL;DR

Feature is **ready for market.** All 11 code surfaces were exercised end-to-end against the prod-mirror local DB and behaved correctly. Three real bugs were found and patched, three skill docs were corrected, one integration test file was added.

One commit landed on the feature branch:

```
fd2942f93  feat(mcp): approval-links + lightweight forks for CMS / decks / emails + 4 content skills
            22 files changed, 2828 insertions(+), 68 deletions(-)
```

Branch: `claude/serene-lamarr-729c5e` — **not pushed** (per repo policy).

---

## What was verified end-to-end

| # | Surface | Result |
|---|---|---|
| 1 | `sd-init` writes `.sd/config.json` from whoami + brand + inventory | ✅ |
| 2 | `sd-create-page` produces a 13-block landing page + approval URL | ✅ post 698 |
| 3 | `sd-create-deck` produces an 8-slide deck with brand theme inherited | ✅ deck 350 |
| 4 | `sd-create-email` renders blocks to HTML, ships via Resend | ✅ campaign 36, real email landed at `info@danielpcoyle.com` |
| 5 | Approve `post`        → `published=true` | ✅ |
| 6 | Approve `pitch_deck`  → `status='published'` + slide drafts promoted (bug found, fixed in this commit) | ✅ |
| 7 | Approve `email_campaign` → link approved, send remains separate | ✅ |
| 8 | Approve `block_template` → draft promoted, version bumped | ✅ |
| 9 | Approve `pending_change` (gated API key) → `applyPendingChange` runs | ✅ |
| 10 | Reject any → entity untouched | ✅ |
| 11 | All 4 fork tools clone + set `parent_*_id` + mint fresh approval URL | ✅ |
| 12 | Approve a fork → fork published, parent untouched | ✅ |
| 13 | Reject a fork → fork untouched, parent untouched | ✅ |
| 14 | Iteration: each update mints a NEW approval URL (skill docs corrected) | ✅ |
| 15 | 6 edge cases (unknown / bad-shape token, double-approve, bad action, missing reviewer, expired) | ✅ |
| 16 | `/approve/[token]` page renders pending badge + interactive modal | ✅ (Playwright) |
| 17 | Submitting the modal flips the link to APPROVED in the UI + DB | ✅ |

## Bugs found and fixed in this commit

1. **OAuth consent dropdown was a no-op.** `app/oauth/authorize/page.tsx` had a hidden `active_client_id` input AND a select with the same name; FormData picked the hidden one and ignored the user's pick. Fixed: one or the other, never both. (You hit this with the CY-Strategies-instead-of-SimplerDevelopment moment earlier — same bug.)
2. **Deck approval didn't promote slide drafts.** Approve flipped `status='published'` but slides stayed in draft, so the public renderer saw nothing. Extracted `applyPublishAllToSlides` into `lib/mcp/decks-publish.ts` and wired it into the approval route. Decks now go fully live on approve.
3. **Skill docs lied about update behavior.** Three skills (`sd-create-page`, `sd-create-deck`, `sd-create-email`) claimed "edit → same approval URL still works." Wrong — each update mints a fresh URL. Docs corrected.

## Bugs surfaced, not yet fixed (worth a follow-up sprint)

- `sites_update.brandingProfileId` tool schema is empty `{}` but server expects `number` — workaround is `branding_create_profile … isDefault: true`.
- Email renderer drops `email-header.logoText` and `email-footer.tagline`.
- Email renderer concatenates default + custom inline styles (duplicate `color:` declarations).
- `ServicesGridBlockRender` renders children without unique `key` props (React dev warning, not a runtime bug).

## What's NOT verified yet

- Concurrent approval race (two reviewers, same instant) — no test.
- Default `expires_at` policy — currently always null. Recommend `now() + 14 days` on mint, with an optional override.

## Test the live artifacts in your browser (dev server still running on :3000)

- Post 698 (APPROVED): http://localhost:3000/approve/5341d36baf950a2be9916ae4611ce8e19f7e310ef54b1269520304953c422991
- Post 698 (most recent update, also APPROVED): http://localhost:3000/approve/0d8535d0f9cd5e1d29e15624bfed9da4e89940fa60239ad6d1e612d88b1c4f9e
- Post 699 (REJECTED fork): http://localhost:3000/approve/62467f42133b48a144541a442a8ce3043044e078a83337127cde6ff0a4ba2e29
- Deck 350 (APPROVED): http://localhost:3000/approve/d561053d17fb8813cc08bb3fb16ae97001dc5ca45355beec62aa723c4e34f821
- Deck 351 (APPROVED fork): http://localhost:3000/approve/6d358200f335a586681d888962f9942376b912cf10294ad2010775203e9fd2be
- Email 36 (APPROVED, already sent): http://localhost:3000/approve/c9e24141f8c7520b091beee712e7f633f1f608f22330bd02462c2844395cb518
- Email 37 (PENDING fork — try the modal on this one): http://localhost:3000/approve/6aa174ad916f89acc50b3ca5252f9b223f23b509f00ac7a5ac4d55c42fe9aab9
- Template 11 (APPROVED): http://localhost:3000/approve/8a40b88a1cf3fdaffda0772c3f2709be776fe7608302800f731408917283e38a
- Pending change 117 (APPROVED, via gated API key): http://localhost:3000/approve/86b75bad39f3e758ee81d1b8c36309340d20d0d3b3600b928a99d0e3d377f12c
- Expired test link (auto-marked on GET): http://localhost:3000/approve/f3a415f8a8337cd0c264e5f0e6f03003a63c18d2816608979efdb180d8cca113

## Where to put the eyes next

1. Open `/approve/<token>` on the pending fork email (link 6aa174ad…) and approve via the modal. Confirm the campaign 37 status doesn't change (correct — send is separate).
2. Decide the default `expires_at` policy (recommend 14 days).
3. Patch the email-renderer drop bugs (logoText, tagline, duplicate styles).
4. Decide whether to push `claude/serene-lamarr-729c5e` to remote and open a PR against staging, or keep it local for further iteration.

## Where state lives

- Local DB: `simplerdev_local_20260514` (Postgres 18.3, prod mirror from earlier today)
- Dev server: `bun dev` background PID, log at `/tmp/sd-dev.log`, port 3000
- OAuth: Claude Desktop connector `simplerdevelopment-local` does DCR automatically; current token is authenticated as user 181 / SimplerDevelopment / wildcard scope
- Approval flow test harness: `/tmp/sd-approve.ts` (bun script, three-arg invocation pattern)
- Comprehensive runbook: `.claude/skills/SD_SKILLS_RUNBOOK.md`
