-- One-shot data migration accompanying drizzle/0049_survey_recommendation.sql.
-- Copies legacy pitch-deck slide-level surveyRecommendation configs onto the
-- corresponding survey row. Idempotent (only sets where surveys.recommendation
-- IS NULL). Safe to re-run.

WITH slide_recs AS (
  SELECT DISTINCT ON ((s->>'surveyId')::int)
    (s->>'surveyId')::int           AS survey_id,
    (s->'surveyRecommendation')::json AS rec
  FROM pitch_decks pd
  CROSS JOIN LATERAL jsonb_array_elements(pd.slides::jsonb) s
  WHERE s ? 'surveyRecommendation'
    AND s ? 'surveyId'
    AND s->'surveyRecommendation' IS NOT NULL
    AND s->>'surveyRecommendation' != 'null'
  ORDER BY (s->>'surveyId')::int, pd.updated_at DESC
)
UPDATE surveys
   SET recommendation = slide_recs.rec
  FROM slide_recs
 WHERE surveys.id = slide_recs.survey_id
   AND surveys.recommendation IS NULL
RETURNING surveys.id, surveys.slug;
