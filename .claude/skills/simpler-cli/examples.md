# simpler CLI — examples

Copy-pasteable flows. See `commands.md` for the full flag/exit-code reference and `SKILL.md` for the rules behind these patterns.

## Discovery — drill down, don't dump

```bash
# Tier 1: domains + counts only (~300 tokens)
simpler manifest --json

# Tier 2: one domain's commands
simpler manifest crm --json

# Tier 3: one command's full arg schema
simpler manifest crm deals-create --json
```

## List → get flow

```bash
# List posts on a site, narrowed to the columns you actually need
simpler posts list --website-id 12 --limit 20 --json --fields id,title,slug,published

# Pull one full record
simpler posts get --id 4821 --json
```

## Parsing JSON output with jq

```bash
# Just the ids
simpler posts list --website-id 12 --json | jq '.data[].id'

# Guard on success before touching .data
simpler crm deals-list --status open --json | jq 'if .success then .data else error(.error.message) end'

# Count open deals in a pipeline
simpler crm deals-list --pipeline-id 3 --status open --json | jq '.data | length'
```

## Create with individual flags vs. `--file` payload

```bash
# Small payload — individual flags
simpler crm deals-create --title "Acme renewal" --pipeline-id 3 --stage-id 11 --value 500000 --json

# Larger/structured payload — write JSON, pass --file (flags still win if you add any on top)
cat > /tmp/new-post.json <<'EOF'
{
  "websiteId": 12,
  "title": "Q3 Product Update",
  "slug": "q3-product-update",
  "blocks": [{ "id": "b1", "type": "hero", "order": 0, "title": "Q3 Product Update" }]
}
EOF
simpler posts create --file /tmp/new-post.json --json
```

## Update a record

```bash
simpler posts update --id 4821 --title "Q3 Product Update (v2)" --published true --json

# Raw JSON blob for a json-typed arg (e.g. blocks) via --args
simpler posts update --id 4821 --args '{"blocks":[{"id":"b1","type":"hero","order":0,"title":"New headline"}]}' --json
```

## Dry-run before a write you're unsure of

```bash
# Nothing is sent — prints the exact tool + arguments that WOULD go out
simpler kanban create-card --project-id 7 --column-id 2 --title "Fix flaky e2e test" --dry-run --json
# {"success":true,"data":{"dryRun":true,"tool":"kanban_create_card","arguments":{"projectId":7,"columnId":2,"title":"Fix flaky e2e test"}}}

# Satisfied it's right — run for real
simpler kanban create-card --project-id 7 --column-id 2 --title "Fix flaky e2e test" --json
```

## Destructive command — explicit `--yes` only after user approval

```bash
# Without --yes in a non-interactive shell: exits 4, nothing happens
simpler bookings cancel --id 903 --reason "client rescheduled" --json
# {"success":false,"error":{"message":"\"bookings cancel\" is destructive and requires confirmation. Re-run with --yes once the user has approved.","code":"confirmation_required"}}

# Only re-run with --yes after the user has explicitly approved THIS action in the conversation:
simpler bookings cancel --id 903 --reason "client rescheduled" --yes --json
```

Never chain `--yes` onto a destructive command speculatively "to save a round trip" — surface the command and its effect, wait for approval, then re-run.

## Approval-gated writes (CMS staging)

Some writes don't apply immediately even with `--yes` — they stage into `mcp_pending_changes` and return a `pending` status and/or approval URL:

```bash
simpler posts update --id 4821 --published true --json
# {"success":true,"data":{"pending":true,"approvalUrl":"https://portal.example.com/approvals/abc123", ...}}
```

When you see `pending` or an approval URL in the response, tell the user the change is staged and share the URL — it is not live until they approve it in the portal.

## `simpler call` — raw escape hatch

For a tool with no comfortable flag form, or when you already have a full JSON payload:

```bash
simpler call store_products_adjust_inventory --args '{"id": 501, "delta": -3, "reason": "damaged in transit"}' --json
```

## `doctor` in CI

```bash
# In a CI job before running any portal-dependent step
simpler doctor --json | tee doctor.json
if [ "$(jq -r '.data.success' doctor.json)" != "true" ]; then
  echo "simpler doctor failed — see doctor.json" >&2
  exit 1
fi
```

## Parity check (does the shipped manifest match the live server?)

```bash
simpler mcp parity --json
# {"success":true,"data":{"inParity":true,"missing":[],"extra":[],"live":451,"manifest":451}}
```

Non-zero exit or `inParity:false` means the manifest is stale — regenerate it (`bun run cli:manifest`) rather than hand-editing `manifest.json`.

## Troubleshooting sequence

When something fails and it's not obvious why, work through this in order rather than guessing:

```bash
# 1. Broad health check — version, config source, key presence, connectivity, whoami
simpler doctor --json

# 2. Narrow to auth specifically if doctor's whoami/keyPresent checks failed
simpler auth status --json

# 3. If the failure was "unknown command" or a bad-flag usage error (exit 2),
#    re-check the real schema instead of guessing flag names
simpler manifest <domain> <action> --json

# 4. If it's a network/timeout error (exit 5), confirm the configured origin
simpler doctor --json | jq '.data.checks[] | select(.name=="origin")'
```

## Realistic domains to reach for

`posts` (CMS pages/blog), `crm` (contacts, companies, deals, pipelines), `kanban` (boards, cards, sprints), `brain` (Company Brain notes/tasks/search/RAG), `store` (products, orders, discounts) — among 40+ others. Run `simpler manifest --json` for the live list rather than assuming a domain exists.
