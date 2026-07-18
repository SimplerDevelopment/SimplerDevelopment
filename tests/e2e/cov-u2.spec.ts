/**
 * CRM E2E Coverage — Unit 2 (indices 0–3 of the "To Test" backlog)
 *
 * Cards investigated:
 *   0. Two-way email sync with Gmail/Outlook — needs spec
 *   1. Sequences / email cadences from CRM — needs spec
 *   2. AI deal assistant (scoring, next-best-action) — needs spec
 *   3. Signed → onboarded lifecycle flow end-to-end — needs spec
 *
 * All four features have NO implementation in app/api/portal/crm/ or lib/.
 * No routes, no handlers, no DB tables for these surfaces were found.
 * Verdict: "gap" for all four cards.
 *
 * This file is intentionally empty of runnable tests so it does not
 * pollute the test run with false failures.
 */
import { test } from './setup/fixtures';

// No tests — all cards in this slice are unimplemented feature gaps.
test.skip('placeholder — no gaps produce runnable tests', async () => {});
