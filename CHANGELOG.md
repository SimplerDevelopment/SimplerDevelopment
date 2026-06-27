# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

This section tracks work in progress toward the first public open-source release.

### Added
- `llms.txt` + `docs/agents/` — agent-readiness documentation set (overview,
  architecture, repository/project maps, API index, MCP tool reference, workflow
  reference, glossary) so AI agents and LLM search can understand the project fast.
- Feature inventory and OSS-readiness audit under `vault/05 - Feature Specs/`.
- `docker/initdb` auto-provisioning of required Postgres extensions (`vector`,
  `pg_trgm`, `pgcrypto`) on first Docker boot, so `docker compose up` →
  `bun run db:migrate` works without manual extension setup.

### Fixed
- `WORKSPACE_TENANT_SECRETS_KEY` is now self-provided in the integrations test
  suite, making the tenancy gate pass without an externally injected secret.
- Documented the previously-undocumented required `ENCRYPTION_KEY` env var in
  `.env.example` and the README quick start.
- Corrected README/`docker-compose.yml` claims that `db:migrate` creates the
  pgvector extension (it does not — extensions are now provisioned at DB init).

### Security
- Working-tree scrub ahead of open-sourcing: removed a committed test credential,
  client asset directories, maintainer PII in mock data, and internal DB
  codenames. (Full git-history sweep is tracked separately.)
