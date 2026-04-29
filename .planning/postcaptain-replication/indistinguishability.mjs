// Binary indistinguishability scorer for postcaptain replication.
//
// For each section's SBS pair under screenshots/sbs/<section>-{live,local}.png,
// asks Claude Opus 4.7 three times whether a designer reviewing the pair
// side-by-side would say they match. Each vote returns
// `{indistinguishable: bool, gaps: [string], reason_if_not: string}`. The
// majority verdict (≥2 of 3) is the consensus.
//
// Why this instead of vision-review's 0–100 score: vision-score wobbles
// ±2-3 between runs at the 85–94 band with no local change. We've hit the
// metric's noise floor and chasing 95 on a stochastic scale is futile.
// "Would a designer say they match?" is a binary acceptance criterion that
// either trips or doesn't, with the gap list from any "no" votes as the
// punch list.
//
// Output:
//   - screenshots/indistinguishability.json  (raw 3-vote results per section)
//   - screenshots/indistinguishability.md    (consensus table + per-section gaps)
//
// Run: ANTHROPIC_API_KEY=... node .planning/postcaptain-replication/indistinguishability.mjs
//
// API choices mirror vision-review.mjs: model `claude-opus-4-7`, structured
// output via `output_config.format: json_schema`, 2 cache breakpoints (system
// prompt + live image — both in the prefix, reused across all 3×8 = 24 calls).
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

const VOTES_PER_SECTION = 3;

const SYSTEM = `You are a senior visual-design reviewer comparing two screenshots of the same web page section: one from the live (canonical) site, one from a local replica.

Looking at the live and local screenshots side-by-side, would a designer reviewing these say they match?

Return JSON: \`{indistinguishable: true|false, gaps: [string], reason_if_not: string}\`.

A 'yes' (indistinguishable: true) requires NO obvious structural, typography, color, or layout differences.

Cosmetic micro-differences (1-2px spacing shifts, ≤3% color tone, font-rendering hinting variation) are acceptable and should still return true.

Vote independently and decisively. If you're on the fence, that itself counts as a "no" because a designer would notice. Each gap should be a short sentence (≤25 words) describing one specific delta. \`reason_if_not\` summarizes the overall reason in one sentence (empty string if indistinguishable).`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    indistinguishable: {
      type: 'boolean',
      description: 'True if a designer reviewing the side-by-side would say they match.',
    },
    gaps: {
      type: 'array',
      description: 'Specific deltas a designer would call out. Empty if indistinguishable.',
      items: { type: 'string' },
    },
    reason_if_not: {
      type: 'string',
      description: 'One-sentence summary of why they do not match. Empty string if they do match.',
    },
  },
  required: ['indistinguishable', 'gaps', 'reason_if_not'],
};

function loadImageBase64(path) {
  return readFileSync(path).toString('base64');
}

async function voteOnce(client, section, liveB64, localB64, voteIdx) {
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
            text: `LOCAL screenshot follows (vote ${voteIdx + 1}/${VOTES_PER_SECTION}). Apply the binary indistinguishability test and return JSON per the schema.`,
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: localB64 },
          },
        ],
      },
    ],
  });

  let parsed = response.parsed_output;
  if (!parsed) {
    const txt = response.content.find((b) => b.type === 'text');
    if (txt) {
      try { parsed = JSON.parse(txt.text); } catch { parsed = null; }
    }
  }
  const usage = response.usage || {};
  return {
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

async function reviewSection(client, section) {
  const livePath = join(SBS_DIR, `${section}-live.png`);
  const localPath = join(SBS_DIR, `${section}-local.png`);
  if (!existsSync(livePath) || !existsSync(localPath)) {
    return { section, skipped: 'missing pair' };
  }
  const liveB64 = loadImageBase64(livePath);
  const localB64 = loadImageBase64(localPath);

  const votes = [];
  for (let i = 0; i < VOTES_PER_SECTION; i++) {
    try {
      const v = await voteOnce(client, section, liveB64, localB64, i);
      votes.push(v);
      const u = v.usage;
      console.log(`  vote ${i + 1}: in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens} cache_create=${u.cache_creation_input_tokens} → ${v.parsed?.indistinguishable === true ? 'YES' : v.parsed?.indistinguishable === false ? 'no' : '?'}`);
    } catch (e) {
      console.error(`  vote ${i + 1} failed:`, e?.message || e);
      votes.push({ error: String(e?.message || e) });
    }
  }

  // Tally
  const yesVotes = votes.filter((v) => v.parsed?.indistinguishable === true).length;
  const noVotes = votes.filter((v) => v.parsed?.indistinguishable === false).length;
  const consensus = yesVotes >= 2 ? 'indistinguishable' : noVotes >= 2 ? 'distinguishable' : 'split';

  // Aggregate gaps from any "no" votes (deduped)
  const gapsSet = new Map();
  for (const v of votes) {
    if (v.parsed?.indistinguishable === false && Array.isArray(v.parsed.gaps)) {
      for (const g of v.parsed.gaps) {
        const key = g.toLowerCase().trim();
        if (!gapsSet.has(key)) gapsSet.set(key, g);
      }
    }
  }

  return {
    section,
    consensus,
    yesVotes,
    noVotes,
    aggregatedGaps: Array.from(gapsSet.values()),
    votes,
  };
}

function renderMd(results) {
  let md = '# postcaptain — binary indistinguishability scorer\n\n';
  md += '_Per-section binary verdict from `claude-opus-4-7`, 3 votes per section, majority consensus. "Indistinguishable" = a designer reviewing the SBS would say the pair matches (cosmetic micro-deltas allowed)._\n\n';

  // Summary table
  md += '## Consensus\n\n| Section | Verdict | Yes / No | Top gap (if not) |\n|---|---|---|---|\n';
  for (const r of results) {
    if (r.skipped) { md += `| ${r.section} | — | _${r.skipped}_ | |\n`; continue; }
    const verdict = r.consensus === 'indistinguishable' ? 'YES' : r.consensus === 'distinguishable' ? 'no' : 'split';
    const tally = `${r.yesVotes} / ${r.noVotes}`;
    const topGap = r.aggregatedGaps[0] ? r.aggregatedGaps[0].replace(/\|/g, '\\|') : '';
    md += `| ${r.section} | ${verdict} | ${tally} | ${topGap} |\n`;
  }
  md += '\n';

  // Per-section detail
  for (const r of results) {
    md += `\n## ${r.section}\n\n`;
    if (r.skipped) { md += `_skipped: ${r.skipped}_\n`; continue; }
    md += `**Consensus:** ${r.consensus} (yes=${r.yesVotes}, no=${r.noVotes})\n\n`;
    if (r.aggregatedGaps.length > 0) {
      md += `**Aggregated gaps from \"no\" votes:**\n`;
      for (const g of r.aggregatedGaps) md += `- ${g}\n`;
      md += '\n';
    }
    for (let i = 0; i < r.votes.length; i++) {
      const v = r.votes[i];
      md += `<details><summary>Vote ${i + 1}</summary>\n\n`;
      if (v.error) {
        md += `_error: ${v.error}_\n\n`;
      } else if (v.parsed) {
        md += `- **indistinguishable:** ${v.parsed.indistinguishable}\n`;
        if (v.parsed.reason_if_not) md += `- **reason:** ${v.parsed.reason_if_not}\n`;
        if (v.parsed.gaps?.length) {
          md += `- **gaps:**\n`;
          for (const g of v.parsed.gaps) md += `  - ${g}\n`;
        }
      } else {
        md += `_no parsed output_\n\n\`\`\`\n${v.raw_text || ''}\n\`\`\`\n`;
      }
      md += `\n</details>\n\n`;
    }
  }

  // Cache stats
  let totalIn = 0, totalOut = 0, totalRead = 0, totalCreate = 0;
  for (const r of results) {
    for (const v of r.votes || []) {
      if (!v.usage) continue;
      totalIn += v.usage.input_tokens;
      totalOut += v.usage.output_tokens;
      totalRead += v.usage.cache_read_input_tokens;
      totalCreate += v.usage.cache_creation_input_tokens;
    }
  }
  md += `\n---\n\n_Token usage: input=${totalIn}, output=${totalOut}, cache_read=${totalRead}, cache_create=${totalCreate}._\n`;
  return md;
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
    console.log(`reviewing ${section}…`);
    try {
      const r = await reviewSection(client, section);
      results.push(r);
      console.log(`  consensus: ${r.consensus} (yes=${r.yesVotes}, no=${r.noVotes})`);
    } catch (e) {
      console.error('  failed', section, e?.message || e);
      results.push({ section, error: String(e?.message || e) });
    }
  }

  writeFileSync(join(ROOT, 'indistinguishability.json'), JSON.stringify(results, null, 2));
  writeFileSync(join(ROOT, 'indistinguishability.md'), renderMd(results));
  console.log('wrote indistinguishability.{md,json}');
})();
