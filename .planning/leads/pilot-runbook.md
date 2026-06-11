# Outbound Demo Pilot — Runbook

Generated 2026-05-13. Continue from here in a fresh Claude Code session after restart.

## State as of last session

- **Goal:** clone 5 prospect sites into the SimplerDevelopment platform as password-gated demo assets for outbound cold email.
- **Target DB:** local `simplerdev_realprod_dryrun` (mirrors prod schema + 136 SD websites). NOT Railway staging, NOT prod.
- **Target client_id:** `1` (Simpler Development — the operational SD client with 226 websites in prod / 136 in local dryrun).
- **Acting user:** `181` (info@danielpcoyle.com).
- **MCP namespace:** new entry registered as `simplerdev-local` in `~/.claude/mcp_servers.json`, points at `http://localhost:3000/api/mcp`. Tools will appear as `mcp__simplerdev_local__*` after Claude Code restart.
- **API key:** generated, hash inserted into `portal_api_keys` (id 188). Full key in `.planning/leads/.mcp-secrets` (chmod 600, gitignored).
- **`.env.local`:** switched from switchyard (staging) → local dryrun DB. Backup at `.env.local.backup-staging-20260513-212114`.

## Before resuming in new session

1. **Restart `bun dev`** so it picks up the new `DATABASE_URL`. Verify with: `curl -s http://localhost:3000/api/health` (or visit the portal admin UI — should now show local data, not staging).
2. **Restart Claude Code** so it loads the new MCP. Verify with `/mcp` — should list `simplerdev-local` alongside the existing `claude_ai_Postcaptain_MCP`.
3. **Paste this runbook** to the new session so context is restored.

## To roll back to staging

```bash
cp .env.local.backup-staging-20260513-212114 .env.local
cp ~/.claude/mcp_servers.json.backup-20260513-* ~/.claude/mcp_servers.json
# restart bun dev + Claude Code
```

To also revoke the API key:
```sql
-- against simplerdev_realprod_dryrun
UPDATE portal_api_keys SET active=false, revoked_at=now() WHERE id=188;
```

## The 5 pilot firms

| # | Firm | Source URL | Cold-email target | Slug suggestion |
|---|---|---|---|---|
| 1 | Gramercy Design (NYC) | https://www.gramercy.design/ | info@gramercy.design | prospect-gramercy-design |
| 2 | Beyond Modern Interiors (NYC) | https://www.bmihomestyling.com/ | info@bmihomestyling.com | prospect-beyond-modern |
| 3 | Storm Interiors (LA) | https://www.storminteriors.com/ | info@storminteriors.com | prospect-storm-interiors |
| 4 | Lark Interiors (Dallas) | https://www.larkinteriorstx.com/ | janelle@larkinteriorstx.com | prospect-lark-interiors |
| 5 | Cortney Bishop Design (Charleston) | https://cortneybishop.com/ | info@cortneybishop.com | prospect-cortney-bishop |

Full CSV with score-5 emails + Instagram: `.planning/leads/outbound-prospects-2026-05.csv`.

## Password-protect approach

The platform has no native password-gate. Workaround: inject a client-side JS overlay via the `client_websites.custom_js` field. **Not real security — a soft gate to keep demos out of Google + casual eyes.** Generate a unique password per site; store in `.planning/leads/.demo-credentials` (chmod 600, gitignored).

Template JS to inject (per site):

```js
(function() {
  var EXPECTED = "<SITE_PASSWORD>";  // unique per demo
  if (sessionStorage.getItem("demo_unlocked") === EXPECTED) return;
  document.documentElement.style.visibility = "hidden";
  document.addEventListener("DOMContentLoaded", function() {
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:#fff;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:sans-serif;";
    overlay.innerHTML = '<form id="g"><h2>Preview Access</h2><input id="p" type="password" placeholder="password" autofocus style="font-size:18px;padding:10px;"><button>Enter</button></form>';
    document.body.appendChild(overlay);
    document.documentElement.style.visibility = "visible";
    document.getElementById("g").addEventListener("submit", function(e) {
      e.preventDefault();
      var v = document.getElementById("p").value;
      if (v === EXPECTED) { sessionStorage.setItem("demo_unlocked", EXPECTED); overlay.remove(); }
      else { document.getElementById("p").value = ""; document.getElementById("p").placeholder = "incorrect"; }
    });
  });
})();
```

## Pilot execution plan (in new session)

For each of the 5 firms, in order, run the `/site-migration` skill via the *new* `simplerdev-local` MCP (tools namespaced `mcp__simplerdev_local__*`):

1. Invoke skill with source URL + target slug + `client_id=1` + `public_access=false`.
2. After migration completes, generate a unique 12-char password, write it into the site's `custom_js` field using the template above, save it to `.demo-credentials` keyed by slug.
3. Verify the demo loads + gate appears at `http://localhost:3000/s/<slug>` (or the relevant preview URL the platform exposes).
4. Record migration outcome (success/failures, time, any block-mapping gaps) in a `pilot-results.md` file.
5. Move to next firm. **Sequential, not parallel** — the skill drives its own crawl pipeline.

After all 5: write a pilot report covering quality, time, gaps. Decide whether to expand.

## What NOT to do

- Do NOT run any of this against Railway staging or prod — the `.env.local` is now pointed at local DB. If `bun dev` crashes or you want staging, restore from backup first.
- Do NOT commit `.planning/leads/.mcp-secrets` or `.planning/leads/.demo-credentials` (both gitignored).
- Do NOT share the demo URLs externally without the password — the JS gate is the only thing between the demo and Google indexing.
