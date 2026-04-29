// Claude vision per-section diagnostic for postcaptain replication.
//
// Reads each section's SBS pair under screenshots/sbs/<section>-{live,local}.png,
// sends both to Claude Opus 4.7, and asks for a strict JSON diagnostic of the
// differences. The live image is reused across every section, so we attach it
// inside a cached system-prompt-equivalent block — Opus 4.7's prompt cache will
// keep that prefix warm and we only pay full price on the (changing) local
// image and the (small) per-section instruction text.
//
// Output:
//   - screenshots/vision-review.json  (raw responses keyed by section)
//   - screenshots/vision-review.md    (human-readable summary)
//
// Run: ANTHROPIC_API_KEY=... node .planning/postcaptain-replication/vision-review.mjs
//
// Notes on the API choices:
//   - Model `claude-opus-4-7` — best vision available. Thinking is off by
//     default; we leave it off because per-section diffs are short tasks.
//   - `output_config.format: { type: "json_schema", schema: ... }` gives us a
//     guaranteed-shape response. (Opus 4.7 supports structured outputs.)
//   - No `temperature`/`top_p`/`top_k` — removed on 4.7 (400 if sent).
//   - `cache_control: {type: "ephemeral"}` is set on (a) the system text block
//     and (b) the live image content block. Both render before the local image
//     in the user message, so the cached prefix is system + live image. Each
//     subsequent section reuses that prefix.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';

const ROOT = '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/.planning/postcaptain-replication/screenshots';
const SBS_DIR = join(ROOT, 'sbs');

const SECTION_ORDER = [
  'hero',
  'services',
  'portals',
  'audits',
  'solutions',
  'stats',
  'team',
  'cta-footer',
];

const SYSTEM = `You are a senior visual-design reviewer comparing two screenshots of the same web page section: one from the live (canonical) site and one from a local replica that should match it.

Report ONLY differences. Do not list things that match.

Your output MUST conform to the supplied JSON schema. Each diff string should be a short sentence (≤25 words) describing one specific delta. \`priority_fix\` is the single highest-leverage change to close the visual gap.

Severity for the score:
  - 100 = visually identical
  -  90 = looks correct at a glance, minor polish missing
  -  70 = recognizably the same section, several visible deltas
  -  50 = same content, different layout/typography
  - <40 = structurally different`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: {
      type: 'integer',
      description: 'Overall visual similarity 0–100',
    },
    structural_diffs: {
      type: 'array',
      description: 'Layout / DOM-shape differences (missing or extra elements, different ordering, wrong number of cards, etc.)',
      items: { type: 'string' },
    },
    style_diffs: {
      type: 'array',
      description: 'Typography / color / spacing / shadow / border differences',
      items: { type: 'string' },
    },
    copy_diffs: {
      type: 'array',
      description: 'Text-content differences (different headings, body copy, CTA labels, etc.)',
      items: { type: 'string' },
    },
    priority_fix: {
      type: 'string',
      description: 'The single highest-leverage change to close the visual gap, in one sentence',
    },
  },
  required: ['score', 'structural_diffs', 'style_diffs', 'copy_diffs', 'priority_fix'],
};

function loadImageBase64(path) {
  const buf = readFileSync(path);
  return buf.toString('base64');
}

async function reviewSection(client, section) {
  const livePath = join(SBS_DIR, `${section}-live.png`);
  const localPath = join(SBS_DIR, `${section}-local.png`);
  if (!existsSync(livePath) || !existsSync(localPath)) {
    return { section, skipped: 'missing pair' };
  }
  const liveB64 = loadImageBase64(livePath);
  const localB64 = loadImageBase64(localPath);

  // Message structure:
  //   system  →  text block (cached)
  //   user    →  [
  //                "Section: <id>. LIVE follows.",
  //                <live image>  (cached — same across sections),
  //                "LOCAL follows.",
  //                <local image>,  (volatile)
  //                "Return JSON per the schema."
  //              ]
  // Cache breakpoints: one on the system block, one on the live image. Both
  // sit in the prefix of every request, so the second through Nth sections
  // read the cache.
  //
  // NOTE: 4 cache breakpoints max per request — we use 2.
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    output_config: {
      format: { type: 'json_schema', schema: SCHEMA },
      effort: 'medium',
    },
    system: [
      {
        type: 'text',
        text: SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Section: ${section}. LIVE screenshot follows (canonical postcaptain.com).`,
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: liveB64 },
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `LOCAL screenshot follows (our replica). Identify ONLY the differences in structure, style, and copy. Then call out the single highest-leverage fix. Return JSON per the schema.`,
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: localB64 },
          },
        ],
      },
    ],
  });

  // The SDK will set parsed_output when output_config.format is a json_schema.
  // Fall back to manual parsing if for any reason it isn't populated.
  let parsed = response.parsed_output;
  if (!parsed) {
    const txt = response.content.find((b) => b.type === 'text');
    if (txt) {
      try { parsed = JSON.parse(txt.text); } catch { parsed = null; }
    }
  }

  const usage = response.usage || {};
  return {
    section,
    parsed,
    usage: {
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens: usage.cache_read_input_tokens || 0,
    },
    raw_text: response.content.find((b) => b.type === 'text')?.text || null,
  };
}

function renderMd(results) {
  let md = '# postcaptain Claude vision review\n\n';
  md += '_Per-section diagnostic from `claude-opus-4-7`. Scores: 100 = identical, 90 = minor polish, 70 = several visible deltas, 50 = same content/different layout, <40 = structurally different._\n\n';
  // Summary table
  md += '## Summary\n\n| Section | Score | Priority fix |\n|---|---:|---|\n';
  for (const r of results) {
    if (r.skipped) { md += `| ${r.section} | — | _${r.skipped}_ |\n`; continue; }
    if (!r.parsed) { md += `| ${r.section} | ? | _no parsed output_ |\n`; continue; }
    const fix = (r.parsed.priority_fix || '').replace(/\|/g, '\\|');
    md += `| ${r.section} | ${r.parsed.score} | ${fix} |\n`;
  }
  md += '\n';
  // Per-section detail
  for (const r of results) {
    md += `\n## ${r.section}\n\n`;
    if (r.skipped) { md += `_skipped: ${r.skipped}_\n`; continue; }
    if (!r.parsed) { md += `_no parsed output_\n\n\`\`\`\n${r.raw_text || ''}\n\`\`\`\n`; continue; }
    const p = r.parsed;
    md += `**Score:** ${p.score}\n\n`;
    md += `**Priority fix:** ${p.priority_fix}\n\n`;
    md += renderList('Structural', p.structural_diffs);
    md += renderList('Style', p.style_diffs);
    md += renderList('Copy', p.copy_diffs);
  }
  // Cache stats footer
  let totalIn = 0, totalOut = 0, totalRead = 0, totalCreate = 0;
  for (const r of results) {
    if (!r.usage) continue;
    totalIn += r.usage.input_tokens;
    totalOut += r.usage.output_tokens;
    totalRead += r.usage.cache_read_input_tokens;
    totalCreate += r.usage.cache_creation_input_tokens;
  }
  md += `\n---\n\n_Token usage: input=${totalIn}, output=${totalOut}, cache_read=${totalRead}, cache_create=${totalCreate}._\n`;
  if (totalRead === 0 && results.length > 1) {
    md += '\n_⚠️  No cache reads observed. Either the cached prefix was below the 4096-token minimum on Opus 4.7, or a cache invalidator slipped in._\n';
  }
  return md;
}

function renderList(label, items) {
  if (!items || items.length === 0) return `**${label} diffs:** _none reported_\n\n`;
  let out = `**${label} diffs:**\n`;
  for (const it of items) out += `- ${it}\n`;
  return out + '\n';
}

(async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set; aborting.');
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  const results = [];
  for (const section of SECTION_ORDER) {
    console.log('reviewing', section);
    try {
      const r = await reviewSection(client, section);
      results.push(r);
      const u = r.usage;
      if (u) {
        console.log(`  in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens} cache_create=${u.cache_creation_input_tokens}`);
      }
    } catch (e) {
      console.error('  failed', section, e?.message || e);
      results.push({ section, error: String(e?.message || e) });
    }
  }

  writeFileSync(join(ROOT, 'vision-review.json'), JSON.stringify(results, null, 2));
  writeFileSync(join(ROOT, 'vision-review.md'), renderMd(results));
  console.log('wrote vision-review.{md,json}');
})();
