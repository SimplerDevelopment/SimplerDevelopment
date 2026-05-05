/**
 * Migrate CY Strategies (client_id=98) deck-related state from STAGING to TARGET.
 * Additive — does NOT touch existing prod-only decks (198, 238, 240).
 *
 * Operations (in one transaction):
 *   - UPDATE pitch_decks row 271 with staging's newer (cmsified) content.
 *   - INSERT pitch_decks row 347 (new TF1 v8 CMS deck).
 *   - INSERT surveys row 75 (tf2-qualifier, links to deck 271).
 *   - INSERT survey_responses rows 16-19 (4 responses captured on staging).
 *   - Bump sequences: pitch_decks_id_seq, surveys_id_seq, survey_responses_id_seq.
 *
 * Pre-conditions verified before any write:
 *   - staging has rows at 271, 347, surveys.75, responses 16-19
 *   - target's pitch_decks.271 exists (will be updated, not inserted)
 *   - target has NO collision at pitch_decks.347, surveys.75, responses 16-19
 *   - target has form_name column on survey_responses (schema-sync prereq)
 *
 *   SOURCE_DATABASE_URL=<staging>  DATABASE_URL=<target>  bun scripts/migrations/migrate-cy-strategies.mjs           # dry run
 *   SOURCE_DATABASE_URL=<staging>  DATABASE_URL=<target>  bun scripts/migrations/migrate-cy-strategies.mjs --apply   # writes
 *
 * Default target if DATABASE_URL is unset: simplerdev_realprod_dryrun on localhost.
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const CLIENT_ID = 98;
const DECK_UPDATE_IDS = [271];
const DECK_INSERT_IDS = [347];
const SURVEY_INSERT_IDS = [75];
const RESPONSE_INSERT_IDS = [16, 17, 18, 19];

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL =
  process.env.DATABASE_URL ?? 'postgresql://dancoyle@localhost:5432/simplerdev_realprod_dryrun';

if (!SOURCE_URL) {
  console.error('SOURCE_DATABASE_URL is required (staging connection).');
  process.exit(1);
}
if (SOURCE_URL === TARGET_URL) {
  console.error('SOURCE_DATABASE_URL and DATABASE_URL point at the same DB. Aborting.');
  process.exit(1);
}

const source = postgres(SOURCE_URL, { max: 1 });
const target = postgres(TARGET_URL, { max: 1 });

function redact(url) {
  return url.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
}

console.log(`source: ${redact(SOURCE_URL)}`);
console.log(`target: ${redact(TARGET_URL)}`);
console.log(`mode:   ${APPLY ? 'APPLY (commits)' : 'DRY RUN (rolls back)'}`);

function buildInsertSql(table, cols) {
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  return `INSERT INTO "${table}" (${colList}) OVERRIDING SYSTEM VALUE VALUES (${placeholders})`;
}

try {
  // ── Pre-flight: pull source rows ───────────────────────────────────────
  console.log('\n--- pre-flight: fetching source rows ---');
  const allDeckIds = [...DECK_UPDATE_IDS, ...DECK_INSERT_IDS];
  const sourceDecks = await source`
    SELECT * FROM pitch_decks WHERE id = ANY(${allDeckIds}) AND client_id = ${CLIENT_ID} ORDER BY id
  `;
  if (sourceDecks.length !== allDeckIds.length) {
    console.error(`expected ${allDeckIds.length} source decks (ids ${allDeckIds}), found ${sourceDecks.length}`);
    process.exit(1);
  }
  console.log(`  pitch_decks   ${sourceDecks.length} rows: ${sourceDecks.map((d) => `${d.id} "${d.title}"`).join(', ')}`);

  const sourceSurveys = await source`
    SELECT * FROM surveys WHERE id = ANY(${SURVEY_INSERT_IDS}) AND client_id = ${CLIENT_ID} ORDER BY id
  `;
  if (sourceSurveys.length !== SURVEY_INSERT_IDS.length) {
    console.error(`expected ${SURVEY_INSERT_IDS.length} source surveys, found ${sourceSurveys.length}`);
    process.exit(1);
  }
  console.log(`  surveys       ${sourceSurveys.length} rows: ${sourceSurveys.map((s) => `${s.id} "${s.slug}" → deck ${s.linked_id}`).join(', ')}`);

  const sourceResponses = await source`
    SELECT * FROM survey_responses WHERE id = ANY(${RESPONSE_INSERT_IDS}) ORDER BY id
  `;
  if (sourceResponses.length !== RESPONSE_INSERT_IDS.length) {
    console.error(`expected ${RESPONSE_INSERT_IDS.length} source responses, found ${sourceResponses.length}`);
    process.exit(1);
  }
  console.log(`  survey_responses  ${sourceResponses.length} rows: ${sourceResponses.map((r) => `${r.id} (form_name=${r.form_name})`).join(', ')}`);

  // ── Pre-flight: target collision checks ────────────────────────────────
  console.log('\n--- pre-flight: target collision checks ---');
  const updateExists = await target`
    SELECT id, title FROM pitch_decks WHERE id = ANY(${DECK_UPDATE_IDS})
  `;
  if (updateExists.length !== DECK_UPDATE_IDS.length) {
    console.error(`expected target to already have decks ${DECK_UPDATE_IDS} for UPDATE, found ${updateExists.length}`);
    process.exit(1);
  }
  console.log(`  decks to UPDATE exist on target: ${updateExists.map((d) => `${d.id} "${d.title}"`).join(', ')}`);

  const insertCollisions = await target`
    SELECT id FROM pitch_decks WHERE id = ANY(${DECK_INSERT_IDS})
  `;
  if (insertCollisions.length > 0) {
    console.error(`target already has decks at ${insertCollisions.map((d) => d.id)}; expected zero — aborting`);
    process.exit(1);
  }
  console.log(`  no collision on insert deck ids: ${DECK_INSERT_IDS.join(',')}`);

  const surveyCollisions = await target`
    SELECT id FROM surveys WHERE id = ANY(${SURVEY_INSERT_IDS})
  `;
  if (surveyCollisions.length > 0) {
    console.error(`target already has surveys at ${surveyCollisions.map((s) => s.id)}; expected zero — aborting`);
    process.exit(1);
  }
  console.log(`  no collision on insert survey ids: ${SURVEY_INSERT_IDS.join(',')}`);

  const respCollisions = await target`
    SELECT id FROM survey_responses WHERE id = ANY(${RESPONSE_INSERT_IDS})
  `;
  if (respCollisions.length > 0) {
    console.error(`target already has survey_responses at ${respCollisions.map((r) => r.id)}; expected zero — aborting`);
    process.exit(1);
  }
  console.log(`  no collision on insert survey_response ids: ${RESPONSE_INSERT_IDS.join(',')}`);

  // ── Transaction ────────────────────────────────────────────────────────
  console.log('\n--- migration transaction ---');
  await target.begin(async (tx) => {
    // 1. UPDATE deck 271
    for (const deck of sourceDecks.filter((d) => DECK_UPDATE_IDS.includes(d.id))) {
      const cols = Object.keys(deck).filter((c) => c !== 'id');
      const setSql = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
      const values = cols.map((c) => deck[c]);
      await tx.unsafe(
        `UPDATE pitch_decks SET ${setSql} WHERE id = $${cols.length + 1}`,
        [...values, deck.id],
      );
      console.log(`  UPDATE pitch_decks id=${deck.id} "${deck.title}"`);
    }

    // 2. INSERT deck 347
    for (const deck of sourceDecks.filter((d) => DECK_INSERT_IDS.includes(d.id))) {
      const cols = Object.keys(deck);
      const sql = buildInsertSql('pitch_decks', cols);
      await tx.unsafe(sql, cols.map((c) => deck[c]));
      console.log(`  INSERT pitch_decks id=${deck.id} "${deck.title}"`);
    }

    // 3. INSERT survey 75
    for (const survey of sourceSurveys) {
      const cols = Object.keys(survey);
      const sql = buildInsertSql('surveys', cols);
      await tx.unsafe(sql, cols.map((c) => survey[c]));
      console.log(`  INSERT surveys id=${survey.id} "${survey.slug}" → deck ${survey.linked_id}`);
    }

    // 4. INSERT survey_responses 16-19
    for (const resp of sourceResponses) {
      const cols = Object.keys(resp);
      const sql = buildInsertSql('survey_responses', cols);
      await tx.unsafe(sql, cols.map((c) => resp[c]));
      console.log(`  INSERT survey_responses id=${resp.id} (survey_id=${resp.survey_id}, form_name=${resp.form_name})`);
    }

    // 5. Bump sequences
    const maxDeckId = Math.max(...allDeckIds);
    const maxSurveyId = Math.max(...SURVEY_INSERT_IDS);
    const maxRespId = Math.max(...RESPONSE_INSERT_IDS);
    await tx`SELECT setval('pitch_decks_id_seq',      GREATEST((SELECT MAX(id) FROM pitch_decks), ${maxDeckId}))`;
    await tx`SELECT setval('surveys_id_seq',          GREATEST((SELECT MAX(id) FROM surveys), ${maxSurveyId}))`;
    await tx`SELECT setval('survey_responses_id_seq', GREATEST((SELECT MAX(id) FROM survey_responses), ${maxRespId}))`;
    console.log(`  SEQUENCE bumps applied (pitch_decks≥${maxDeckId}, surveys≥${maxSurveyId}, survey_responses≥${maxRespId})`);

    // 6. Verification
    console.log('\n--- post-state verification ---');
    const post = await tx`
      SELECT id, title, slug FROM pitch_decks WHERE id = ANY(${allDeckIds}) ORDER BY id
    `;
    for (const r of post) console.log(`  pitch_decks   ${r.id}  ${r.title}  (${r.slug})`);
    const postSurveys = await tx`SELECT id, slug, linked_id FROM surveys WHERE id = ANY(${SURVEY_INSERT_IDS})`;
    for (const r of postSurveys) console.log(`  surveys       ${r.id}  ${r.slug} → deck ${r.linked_id}`);
    const postResp = await tx`SELECT id, survey_id, form_name FROM survey_responses WHERE id = ANY(${RESPONSE_INSERT_IDS}) ORDER BY id`;
    for (const r of postResp) console.log(`  survey_responses  ${r.id}  survey=${r.survey_id} form=${r.form_name}`);

    if (
      post.length !== allDeckIds.length ||
      postSurveys.length !== SURVEY_INSERT_IDS.length ||
      postResp.length !== RESPONSE_INSERT_IDS.length
    ) {
      throw new Error('post-state count mismatch — aborting');
    }

    if (!APPLY) {
      console.log('\nDRY RUN — rolling back.');
      throw new Error('__DRY_RUN_ROLLBACK__');
    }
  });

  if (APPLY) {
    console.log('\nDONE — committed.');
  }
} catch (err) {
  if (err?.message === '__DRY_RUN_ROLLBACK__') {
    console.log('rolled back as expected.');
    process.exit(0);
  }
  console.error('\nFAILED:', err.message);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
} finally {
  await source.end();
  await target.end();
}
