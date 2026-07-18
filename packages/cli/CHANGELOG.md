# Changelog

All notable changes to `@simplerdevelopment/cli` are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). See the README's "Stability" section for this package's pre-1.0 versioning policy.

## 0.1.0

Initial published release.

### Added
- `simpler` CLI: manifest-driven, JSON-first client for the SimplerDevelopment portal's MCP tool surface (451-tool parity at release).
- Generated `<domain> <action>` commands for every MCP tool (e.g. `posts_list` → `simpler posts list`), plus built-ins: `auth login|status|logout`, `manifest`, `doctor`, `call <tool_name>`, `mcp parity`, `version`, `help`.
- Config resolution across flags, `SIMPLER_API_URL`/`SIMPLER_API_KEY` (and `SD_MCP_URL`/`SD_MCP_API_KEY`) env vars, `./.simpler.json`, and `~/.simpler/config.json`.
- `--dry-run` argument validation/preview and `--yes`-gated confirmation for destructive commands.
- npm publishing configuration (`publishConfig`, `files`, Apache-2.0 license).

<!--
NOTE (not part of the changelog, left for the maintainer): package.json currently
reads 0.2.0 — commits 239a1009 (`simpler setup`) and 7e10712c (`simpler create`)
bumped it in prep for a follow-on release — but the npm registry has only ever
published 0.1.0. Add a `## 0.2.0` entry here when that version actually ships;
not added now since documenting/cutting an unreleased version is a release
decision, not a mechanical doc-hygiene one.
-->
