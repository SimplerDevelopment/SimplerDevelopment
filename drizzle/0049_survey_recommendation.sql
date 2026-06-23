-- Survey Recommendation — move from pitch-deck slide to survey row
-- The recommendation config (offerings, per-answer routing, narrative, CTA) is
-- now owned by the survey itself so it stays consistent across every place the
-- survey is rendered (decks today, standalone /s/<slug> pages tomorrow). Decks
-- read survey.recommendation when building the result slide.
--
-- Backwards compat: pitchDecks.slides[].surveyRecommendation is preserved on
-- existing rows but no longer written to. The render path falls back to it
-- only if survey.recommendation is null, so no deck breaks during the cutover.

ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "recommendation" json;
