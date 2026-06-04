# Developer Documentation

SimplerDevelopment gives you three ways to build on the platform: an authenticated REST API for headless CMS and commerce, a public API for booking and chat without credentials, and an MCP server for driving the portal with an AI agent.

## REST API

[`./api/`](./api/) — Authenticated headless CMS and commerce API. Use `sd_live_` keys to manage posts, media, products, and all portal resources programmatically.

## Public API

[`./api/booking`](./api/booking) — No key required. Use for booking pages, live chat, and reading public content from your site.

## MCP (AI agent) API

[`./mcp`](./mcp) — Connect Claude Desktop, Claude Code, or any MCP client to drive the portal directly. Supports one-click OAuth via Claude.ai or API-key authentication for scripts and CI.
