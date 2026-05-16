// Calls Anthropic to draft a blog post from an already-produced research
// brief. No tools — the brief is the single source of truth, and the call
// is a writing task, not a research task. Style guidance is lifted from the
// local `draft-blog-post` skill but adapted for cloud (no vault context).
//
// Output is parsed back into { title, body } from a "<title>\n\n<body>"
// envelope. Length is targeted via the targetLength input (short / medium /
// long ↔ 600 / 1200 / 2000 words).

import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are an editorial copywriter specializing in higher-education enrollment marketing. Write in the voice of a thoughtful trade publication — confident, plain, no marketing hype.

OUTPUT FORMAT — VERY IMPORTANT:
- Line 1: the post title (no markdown prefix, no quotes, no trailing punctuation beyond a question mark if it's a question).
- Line 2: blank.
- Line 3 onward: the post body in markdown. Use H2 (##) for section headings. Do NOT include the title again inside the body.

STYLE RULES:
- Lead with a specific, concrete observation. Not "In today's fast-moving world of higher ed..." — start with something datable and grounded in the brief.
- Cite every claim that came from a specific source. Use inline markdown links to the URLs given in the brief's Sources section.
- Specificity over adjectives. "Enrollment teams waste 6 hours a week on Slate reports" beats "Enrollment teams face significant reporting challenges."
- No AI tells: avoid "in today's rapidly evolving landscape", "it's important to note that", "delve into", "unlock", "leverage", "unpack", "moreover", and bulleted lists of three-word bullets.
- Match plain trade-pub voice. First person plural ("we") is fine if the brief implies an editorial point of view; otherwise stay third person.
- Never fabricate quotes or statistics. If the brief doesn't have a specific number, speak generally.
- Close with a concrete recommendation the reader can act on this week. Not "contact us to learn more."`;

export interface DraftBlogPostInput {
  brief: {
    topic: string;
    body: string;
    sources: Array<{ url: string; title?: string }>;
  };
  targetLength?: 'short' | 'medium' | 'long';
}

export interface DraftBlogPostOutput {
  title: string;
  body: string;
}

const WORD_TARGETS: Record<NonNullable<DraftBlogPostInput['targetLength']>, number> = {
  short: 600,
  medium: 1200,
  long: 2000,
};

/**
 * Drafts a single blog post from a research brief. Throws on hard SDK or
 * network failure; the runner catches and persists errorSummary.
 */
export async function runDraftBlogPost(
  input: DraftBlogPostInput,
): Promise<DraftBlogPostOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('runDraftBlogPost: ANTHROPIC_API_KEY env var is not set');
  }
  const client = new Anthropic({ apiKey });

  const length = input.targetLength ?? 'medium';
  const wordTarget = WORD_TARGETS[length];

  const sourceList = input.brief.sources.length > 0
    ? input.brief.sources
      .map((s, i) => `${i + 1}. ${s.title ? `${s.title} — ` : ''}${s.url}`)
      .join('\n')
    : '(no sources provided)';

  const userPrompt = [
    `Topic: ${input.brief.topic}`,
    `Target length: ~${wordTarget} words (±20% is fine).`,
    '',
    'Research brief to draw from:',
    '---',
    input.brief.body,
    '---',
    '',
    'Sources available for inline citation:',
    sourceList,
    '',
    'Draft the post now. Remember: line 1 is the title, line 2 is blank, line 3+ is the body in markdown with H2 sections.',
  ].join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Pull only the text blocks out of the response. The SDK's ContentBlock
  // union contains many shapes (tool_use, server_tool_use, etc.); we only
  // care about plain text here since this call uses no tools.
  const text = response.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .filter(s => s.length > 0)
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('runDraftBlogPost: model returned no text content');
  }

  return parseTitleAndBody(text);
}

/**
 * Splits the model output into a single-line title + body. Defensive: if the
 * model violates the envelope and prefixes the title with `# `, strip it.
 */
function parseTitleAndBody(raw: string): DraftBlogPostOutput {
  const lines = raw.split('\n');
  // Find the first non-empty line; that's the title.
  let titleIdx = 0;
  while (titleIdx < lines.length && lines[titleIdx].trim() === '') titleIdx += 1;
  if (titleIdx >= lines.length) {
    throw new Error('runDraftBlogPost: model output had no title line');
  }
  let title = lines[titleIdx].trim();
  // Strip a leading H1 marker if the model couldn't help itself.
  title = title.replace(/^#+\s*/, '');
  // Strip surrounding quotes if the model wrapped the title.
  title = title.replace(/^["'`](.*)["'`]$/, '$1').trim();

  // The body is everything after the title, with one leading blank line
  // skipped if present. Preserve internal blank lines as written.
  let bodyStart = titleIdx + 1;
  while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart += 1;
  const body = lines.slice(bodyStart).join('\n').trim();

  if (!title) {
    throw new Error('runDraftBlogPost: parsed title was empty');
  }
  if (!body) {
    throw new Error('runDraftBlogPost: parsed body was empty');
  }

  return { title, body };
}
