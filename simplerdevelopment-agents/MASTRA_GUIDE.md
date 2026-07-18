# Learning Mastra (taught through this repo)

This is a learning guide for **Mastra**, the TypeScript AI-agent framework, taught by
mapping its concepts onto the files already in this project. We're on
**`@mastra/core ^1.46`** (the v1 line). The repo is the default Mastra "weather agent"
scaffold, which conveniently contains every core primitive.

> ⚠️ APIs shift between Mastra versions. Verify anything here against the docs for our
> exact version, and load the project `mastra` skill before building. The code references
> below are ground-truth from this repo as of writing.

---

## What Mastra is

Open-source, **TypeScript-native** framework for AI agents, workflows, and RAG. Not a
Python port — schemas are Zod, runs on any Node runtime, ships a local dev UI
(**Mastra Studio**, `localhost:4111`). Hit 1.0 in Jan 2026.

Everything is assembled in one composition root: **`src/mastra/index.ts`**, a single
`new Mastra({...})` that registers agents, workflows, scorers, storage, logging, and
observability. **Rule (`AGENTS.md`): register everything there** — nothing is live until
it's wired in.

---

## The six primitives (all present in this repo)

### 1. Agent — `src/mastra/agents/weather-agent.ts`
`instructions + model + tools + memory + scorers`. You give it a goal in natural
language; it decides which tools to call, when, and when it's done.

```ts
export const weatherAgent = new Agent({
  id: 'weather-agent',
  instructions: `You are a helpful weather assistant...`, // the system prompt = product logic
  model: 'openai/gpt-5-mini',   // unified model router: "provider/model" string
  tools: { weatherTool },
  memory: new Memory(),
  scorers: { ... },
});
```

- **`model` is just a string.** The router maps `provider/model` to 3,000+ models across
  ~90 providers. Swap providers by editing one string (+ the provider's API key in `.env`).
- **`instructions` is the highest-leverage thing you own** — it's most of the behavior.

### 2. Tool — `src/mastra/tools/weather-tool.ts`
A typed function the agent can call. The schema is the contract the LLM sees.

```ts
export const weatherTool = createTool({
  id: 'get-weather',
  description: 'Get current weather for a location', // model reads this to decide when to call
  inputSchema: z.object({ location: z.string().describe('City name') }),
  outputSchema: z.object({ temperature: z.number(), /* ... */ }),
  execute: async (inputData) => getWeather(inputData.location),
});
```

`description` and each `.describe()` are **prompt engineering, not docs** — they're how the
model decides what to pass and when to call. `execute` is plain TypeScript (here: two
open-meteo HTTP calls). Tools are where the agent reaches the real world (APIs, DBs, MCP
servers — note the SimplerDevelopment portal exposes ~400 MCP tools an agent could use).

### 3. Workflow — `src/mastra/workflows/weather-workflow.ts`
Agents are non-deterministic; **workflows are deterministic** — explicit steps, branching,
parallelism, loops, pause-for-human-approval. Built from `createStep` + `createWorkflow`;
each step has its own `inputSchema`/`outputSchema` so steps type-check like a pipeline.

**Agent vs workflow:** agent = open-ended ("answer weather questions"); workflow = fixed
process ("fetch → summarize → email", same every time). They compose — a workflow step can
call an agent, and an agent can run a workflow as a tool.

### 4. Memory — `new Memory()` in the agent
Persistence across turns (conversation history; optionally semantic recall + working
memory). Backed by storage. Currently defaults, persisting to LibSQL.

### 5. Scorers — `src/mastra/scorers/weather-scorer.ts`
Mastra's **eval** layer. Each scorer auto-grades outputs (here: tool-call appropriateness,
completeness, translation). `sampling: { type: 'ratio', rate: 1 }` = score 100% of runs.
Results show in Studio — the "are my prompt changes actually better?" feedback loop.

### 6. Storage + Observability — `src/mastra/index.ts`
- **Storage:** `MastraCompositeStore` — LibSQL (`file:./mastra.db`) default, DuckDB for the
  observability domain. Persists memory, evals, traces.
- **Observability:** OTel-style tracing with a `SensitiveDataFilter` (redacts
  passwords/tokens) + exporter to Mastra's hosted platform if `MASTRA_PLATFORM_ACCESS_TOKEN`
  is set.

---

## The mental model: the agent loop

The one concept to truly understand.

```
user message
   ↓
[ model reads: instructions + memory + available tool schemas ]
   ↓
model decides: respond directly  OR  call a tool
   ↓ (if tool)
execute tool → feed result back into the model
   ↓
loop until the model decides it's done → final answer (streamed or whole)
```

Everything else — memory, RAG, scorers, MCP — is about **what context goes into that loop**
and **how you measure what comes out**. "Context engineering" is the actual craft.

---

## Try it

```bash
bun dev   # = "mastra dev"
```

Open **`localhost:4111`** (Mastra Studio): chat with the agent, watch each tool call + the
trace, run the workflow, see scorer results. **Learn by mutating the scaffold** — change
`instructions`, add a field to the tool's `outputSchema`, add a second tool, watch the loop
change in Studio.

---

## Resources (best-first)

**Official**
- Docs home — https://mastra.ai/docs
- Quickstart — https://mastra.ai/guides/getting-started/quickstart
- **Free ~90-min course "Build Your First Agent in TypeScript"** — https://mastra.ai/blog/build-your-first-agent-course
- Agents overview — https://mastra.ai/docs/agents/overview
- Blog — https://mastra.ai/blog (e.g. The Agent Prototype Playbook — https://mastra.ai/blog/agent-prototype-playbook)
- GitHub (read `examples/`) — https://github.com/mastra-ai/mastra

**Third-party tutorials**
- Firecrawl: Build AI Agents in TypeScript with Mastra — https://www.firecrawl.dev/blog/mastra-tutorial
- WorkOS: TS agent in 5 min — https://workos.com/blog/mastra-ai-quick-start
- DEV: First agent in 5 minutes — https://dev.to/mastra_ai/build-your-first-agent-in-5-minutes-with-mastra-2ah3
- Generative.inc: Complete Guide (2026) — https://www.generative.inc/mastra-ai-the-complete-guide-to-the-typescript-agent-framework-2026
- SurePrompts: Prompting Guide — https://sureprompts.com/blog/mastra-prompting-guide

**YouTube:** Mastra's own channel (linked from docs) is highest-signal; favor 2026 uploads
since the framework moves fast.
