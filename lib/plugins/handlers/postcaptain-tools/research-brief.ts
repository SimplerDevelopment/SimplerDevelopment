// Calls Anthropic to produce a research brief on a topic, with the native
// web_search tool enabled so the model can pull recent external sources.
// Style guidance is lifted from the local `research-competitor` skill but
// adapted: this runs in a cloud worker with NO filesystem / vault access, so
// the web is the primary source. Citations are required; speculation is not.
//
// Tool-use loop: web_search_20250305 is a server-side tool — Anthropic
// executes the search and feeds the result back into the next message in the
// same turn. We do NOT need to handle tool execution ourselves; we just
// invoke `messages.create()` and read the final assistant text + collect any
// `web_search_tool_result` blocks for citation URLs.

import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a research analyst producing a synthesis brief for an editorial team focused on higher-education enrollment marketing. Topics typically center on Technolutions Slate, competing CRMs, and adjacent enrollment-marketing trends.

Output a single markdown brief, written for an internal strategic reader (not a marketing audience). Use the following structure with H2 headings:

## TL;DR
Three bullets max. What's the headline finding, who it matters to, what's distinctive about this moment.

## Context
One short paragraph framing why the topic matters now. Date every claim about "recent" or "new".

## Findings
3–5 H3 subsections, each making one specific claim backed by a cited source. No marketing fluff. Specificity over adjectives — concrete numbers, dates, product names beat generic statements.

## Implications for Post Captain
Honest read of what this means for an enrollment-marketing consultancy serving Slate clients. Where's the opening? Where's the risk?

## Open Questions
Bulleted list of what you could NOT determine from public sources. Be specific.

## Sources
Numbered list. Each entry: title, URL, access date (today's date in YYYY-MM-DD). Include EVERY source you cited above.

Rules:
- Cite every claim with the source URL inline (e.g. "Slate launched X in March 2026 [https://...]"). The final Sources section repeats them numbered.
- Be specific about dates, product names, and numbers. If you can't pin a date, don't claim recency.
- Do NOT speculate. If the data isn't there, say so in Open Questions.
- No AI tells: avoid "in today's rapidly evolving landscape", "delve into", "unlock", "leverage", "moreover".
- Use web_search aggressively for fresh signal — you have up to 5 searches.`;

export interface ResearchBriefInput {
  topic: string;
  focus?: string;
}

export interface ResearchBriefOutput {
  topic: string;
  focus: string | null;
  body: string;
  sources: Array<{ url: string; title?: string }>;
}

/**
 * Runs a single research-brief generation. Throws on hard SDK or network
 * failure; the caller (runner.executeRun) catches and persists errorSummary.
 *
 * NOT idempotent on its own — each call burns an Anthropic credit. The
 * runner's CAS-claim is what makes the end-to-end run idempotent.
 */
export async function runResearchBrief(
  input: ResearchBriefInput,
): Promise<ResearchBriefOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('runResearchBrief: ANTHROPIC_API_KEY env var is not set');
  }
  const client = new Anthropic({ apiKey });

  const userPrompt = [
    `Topic: ${input.topic}`,
    input.focus ? `Focus: ${input.focus}` : 'Focus: (no specific angle — general synthesis)',
    '',
    'Produce the research brief now. Use web_search to find recent, specific, citable sources.',
  ].join('\n');

  // The Anthropic SDK exposes web_search via the `web_search_20250305` tool
  // type. This is a SERVER-SIDE tool — the platform runs the search and
  // injects the results back into the response. We don't run a manual
  // tool-use loop; we just read the final assistant message blocks.
  // If the SDK version drifts and this tool name is no longer accepted, the
  // create() call will throw a 400 with a clear "unknown tool type" message,
  // which is what we want — fail loudly rather than silently degrade.
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Collect prose from text blocks and citation URLs from
  // web_search_tool_result blocks. The model also typically inlines URLs as
  // markdown — those are captured by the regex pass over `body`.
  const textParts: string[] = [];
  const citationUrls = new Map<string, string | undefined>();

  for (const block of response.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
      // Pull any bare URLs out of the prose as a backstop.
      const urlRegex = /https?:\/\/[^\s)>\]]+/g;
      const matches = block.text.match(urlRegex) ?? [];
      for (const raw of matches) {
        // Trim trailing punctuation that often follows a URL in prose.
        const url = raw.replace(/[.,;:!?)]+$/, '');
        if (!citationUrls.has(url)) citationUrls.set(url, undefined);
      }
    } else if (block.type === 'web_search_tool_result') {
      // `content` is either an array of web_search_result blocks or an error
      // block. We only care about the successful results for citation
      // extraction.
      const content = (block as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (
            item &&
            typeof item === 'object' &&
            'type' in item &&
            (item as { type: string }).type === 'web_search_result'
          ) {
            const r = item as { url?: string; title?: string };
            if (r.url) {
              const existing = citationUrls.get(r.url);
              if (existing === undefined && r.title) {
                citationUrls.set(r.url, r.title);
              } else if (!citationUrls.has(r.url)) {
                citationUrls.set(r.url, r.title);
              }
            }
          }
        }
      }
    }
  }

  const body = textParts.join('\n').trim();
  if (!body) {
    throw new Error('runResearchBrief: model returned no text content');
  }

  const sources = Array.from(citationUrls.entries())
    .map(([url, title]) => (title ? { url, title } : { url }));

  return {
    topic: input.topic,
    focus: input.focus ?? null,
    body,
    sources,
  };
}
