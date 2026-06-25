# Monorepo layout

This repository holds three projects. The **Next.js app stays at the repo root**
(`app/`, `lib/`, `components/`, …) — unchanged. Two sibling packages live
alongside it:

| Path | What it is | Toolchain |
|---|---|---|
| `/` (root) | SimplerDevelopment2026 — the main Next.js app, CRM, Company Brain, portal | Next 16 + Bun |
| `sd-agents/` | Mastra AI agents (Company Brain + Portal assistant) that talk to the portal over MCP | Mastra v1 + Bun |
| `sd-chat-mobile/` | Expo / React Native mobile chat client | Expo + Bun |

## Independent installs (not hoisted)

Each package keeps **its own `bun.lock` and installs independently**. They are
deliberately **not** Bun workspace members of the root app:

- `sd-chat-mobile` is Expo/React Native; hoisting it into the Next.js/React-19
  dep tree causes duplicate-React / Metro breakage.
- Keeping them standalone means the root app's `bun install --frozen-lockfile`
  (used by CI and Vercel) and the production deploy are untouched.

Work in each package from its own directory:

```bash
# main app (root)
bun install && bun dev

# Mastra agents
cd sd-agents && bun install && bun dev      # Mastra Studio on :4111
# see sd-agents/BRAIN_AGENT_README.md

# mobile chat
cd sd-chat-mobile && bun install && bun start
```

Deploy/CI config (`vercel.json`, `.github/workflows/ci.yml`) targets the root
app only; the sibling packages are not built by them.
