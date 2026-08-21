import { NextResponse } from 'next/server';

const LLMS_TXT = `# SimplerDevelopment

> Multi-tenant agency SaaS: websites + CMS, CRM, AI Company Brain (RAG),
> automations, commerce, bookings, email campaigns — all controllable via
> a 450+-tool MCP server. Apache-2.0. Self-hostable on any Next.js host + Postgres.

## Product overview
- [What is SimplerDevelopment](/about): Platform summary, target audience, and feature overview.
- [Features & Solutions](/solutions): All product modules — website builder, CRM, AI knowledge base, email, bookings, project management, and more.
- [Pricing](/pricing): Modular subscription model. Per-seat plans (Starter/Growth/Scale). 14-day free trial.

## Services
- [AI consulting & agent development](/ai-consulting): Implementation services — production AI agents, multi-agent systems, RAG/retrieval, and MCP integration built in Mastra, CrewAI, or LangGraph. Fixed-scope engagements: Agent Sprint from $9,500 (2 weeks, one workflow live), Agent Build from $35,000 (6-12 weeks, multi-agent system), Run & Improve from $4,500/month (operation, model upgrades, eval regression). Client owns the code; the platform is an optional substrate, not a condition of the work.

## Developer docs
- [API overview](/docs): The four API surfaces — REST v1, public API, portal-internal API, and MCP.
- [MCP tool catalog](/docs/mcp): The 450+-tool MCP server. Namespace index, credential/scope model, approval-link pattern.
- [REST API authentication](/docs/api/authentication): sd_live_ keys, Bearer auth, rate limits.
- [Company Brain tools](/docs/api/mcp/brain-tools): 156 MCP tools under brain_* namespace for the AI knowledge base.
- [CRM & services tools](/docs/api/mcp/crm-tools): Contacts, companies, deals, proposals, bookings.

## Key facts (verifiable)
- Apache-2.0 licensed. Self-hostable.
- 451 MCP tools at POST /api/mcp (Streamable HTTP). Tool count enforced by a baseline test.
- MCP auth: sd_mcp_ portal API keys (SHA-256) or sd_oauth_ OAuth 2.1 tokens (RFC 7636 PKCE).
- ~50 named scopes (brain:read, crm:write, email:send, etc). Wildcard * grants all 451 tools.
- Company Brain: 156 MCP tools (brain_* namespace). Semantic search via OpenAI embeddings + pgvector.
- 47 built-in block types in the visual website editor.
- 22 product domains. BYOK for OpenAI and Stripe.
- Integrations: Google Workspace, Microsoft 365/Teams, Stripe, Resend, Dropbox Sign, EasyPost, Printful, Zoom, OpenAI.

## Positioning
- Not an all-in-one consumer tool. Target: software agencies delivering white-label digital infrastructure to clients.
- One deployment = one agency admin panel + N client portals + N public-facing client websites.
- MCP surface lets Claude, ChatGPT, and other AI agents operate every domain programmatically.
`;

export function GET() {
  return new NextResponse(LLMS_TXT, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
