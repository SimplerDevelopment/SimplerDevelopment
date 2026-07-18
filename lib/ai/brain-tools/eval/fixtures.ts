/**
 * Eval fixtures for the Company Brain Agent.
 *
 * Each fixture describes one test case: the question to ask, which tools the
 * agent must call, tools it must NOT call, and keywords the answer must/must-not
 * contain. These are used by the eval runner in runner.ts.
 *
 * Intent taxonomy mirrors BrainIntent from classifier.ts:
 *   lookup     — find/retrieve existing knowledge
 *   capture    — create/record new info
 *   planning   — OKR, initiatives, goals questions
 *   people     — find experts, org chart, who-knows
 *   procedural — playbook, process, runbook questions
 *   summary    — dashboard, overview, status questions
 */

export interface EvalFixture {
  id: string
  intent: 'lookup' | 'capture' | 'planning' | 'people' | 'procedural' | 'summary'
  complexity: 'simple' | 'complex'
  question: string
  /** At least one of these tools must be called for the test to pass */
  expectedTools: string[]
  /** None of these tools should be called */
  forbiddenTools?: string[]
  /** Keywords that must appear in the final answer (case-insensitive) */
  answerMustContain?: string[]
  /** Hallucination markers — made-up entities that must NOT appear in the answer */
  answerMustNotContain?: string[]
  /** Human-readable description of what this fixture validates */
  description: string
}

export const EVAL_FIXTURES: EvalFixture[] = [
  // ─── lookup × 3 ───────────────────────────────────────────────────────────

  {
    id: 'lookup-decision-by-search',
    intent: 'lookup',
    complexity: 'simple',
    question: 'What was the decision we made about switching our primary database?',
    expectedTools: ['brain_search', 'brain_list_decisions', 'brain_get_decision'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['ACME Corp', 'FictionalDB', 'SynthBase'],
    description:
      'Agent must search or list decisions to answer a lookup about a specific past decision; must not hallucinate company names or database products not in the KB.',
  },

  {
    id: 'lookup-glossary-term',
    intent: 'lookup',
    complexity: 'simple',
    question: 'What does "NRR" mean in our glossary?',
    expectedTools: ['brain_lookup_glossary', 'brain_list_glossary'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustContain: ['NRR'],
    answerMustNotContain: ['FakeMetric', 'GrossRetentionRate'],
    description:
      'Agent must call a glossary tool to look up a term rather than answering from training data.',
  },

  {
    id: 'lookup-note-content',
    intent: 'lookup',
    complexity: 'simple',
    question: 'Find the note about our onboarding process for enterprise clients.',
    expectedTools: ['brain_search', 'brain_get_note'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['GlobalTech Inc.', 'AcmeOnboard', 'FictitiousCorp'],
    description:
      'Agent must search the brain and optionally fetch the full note body; must not fabricate company references.',
  },

  // ─── capture × 2 ──────────────────────────────────────────────────────────

  {
    id: 'capture-new-note',
    intent: 'capture',
    complexity: 'simple',
    question: 'Save a note titled "Q3 retro action items" with the following body: Review sprint velocity, schedule team offsite, update Notion templates.',
    expectedTools: ['brain_create_note'],
    forbiddenTools: ['brain_search', 'brain_list_decisions'],
    answerMustContain: ['Q3 retro action items'],
    answerMustNotContain: ['FakeProject', 'SynthTask'],
    description:
      'Agent must call brain_create_note with the user-supplied title and body; must not call unrelated read tools first.',
  },

  {
    id: 'capture-new-task',
    intent: 'capture',
    complexity: 'simple',
    question: 'Create a high-priority task: "Update the SOC 2 evidence collection checklist before the end of the month."',
    expectedTools: ['brain_create_task'],
    forbiddenTools: ['brain_create_note', 'brain_search'],
    answerMustContain: ['SOC 2'],
    answerMustNotContain: ['ISO 27001 checklist', 'FakeAuditTask'],
    description:
      'Agent must call brain_create_task with priority=high; must not re-route to note creation or search.',
  },

  // ─── planning × 2 ─────────────────────────────────────────────────────────

  {
    id: 'planning-active-initiatives',
    intent: 'planning',
    complexity: 'simple',
    question: 'What are our currently active strategic initiatives?',
    expectedTools: ['brain_list_initiatives'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['FakeInitiative', 'ProjectNovus', 'SynthStrategy'],
    description:
      'Agent must call brain_list_initiatives with status=active to enumerate current strategic work.',
  },

  {
    id: 'planning-at-risk-goals',
    intent: 'planning',
    complexity: 'complex',
    question: 'Which of our initiatives have at-risk goals, and what decisions were made around them?',
    expectedTools: ['brain_list_initiatives', 'brain_list_decisions', 'brain_dashboard_summary'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['FakeGoal', 'SynthOKR', 'GhostInitiative'],
    description:
      'Complex planning query requiring the agent to cross-reference initiatives with decisions; validates multi-tool reasoning without hallucination.',
  },

  // ─── people × 2 ───────────────────────────────────────────────────────────

  {
    id: 'people-find-expert',
    intent: 'people',
    complexity: 'simple',
    question: 'Who in our company has expertise in security compliance?',
    expectedTools: ['brain_list_people', 'brain_search'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['John Doe', 'Jane Smith', 'FakePerson Corp'],
    description:
      'Agent must query the people directory (and optionally search) to surface subject-matter experts rather than fabricating names.',
  },

  {
    id: 'people-active-advisors',
    intent: 'people',
    complexity: 'simple',
    question: 'List all active advisors in the company brain.',
    expectedTools: ['brain_list_people'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['FakeAdvisor', 'SynthConsultant'],
    description:
      'Agent must filter brain_list_people with status=advisor; must not hallucinate advisor names not in the directory.',
  },

  // ─── procedural × 2 ───────────────────────────────────────────────────────

  {
    id: 'procedural-search-playbook',
    intent: 'procedural',
    complexity: 'simple',
    question: 'Do we have a playbook for handling customer escalations?',
    expectedTools: ['brain_search'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['FakePlaybook', 'SynthRunbook', 'ACME Escalation Guide'],
    description:
      'Agent must search the brain for escalation playbooks; must not fabricate process documents.',
  },

  {
    id: 'procedural-onboarding-steps',
    intent: 'procedural',
    complexity: 'complex',
    question: 'Walk me through the steps for onboarding a new team member based on our documented process.',
    expectedTools: ['brain_search', 'brain_get_note'],
    forbiddenTools: ['brain_create_task', 'brain_create_note'],
    answerMustNotContain: ['FakeHRSystem', 'SynthOnboardingTool', 'GhostProcess'],
    description:
      'Complex procedural query that requires searching for onboarding notes and fetching full note body; validates that the agent grounds its answer in the KB.',
  },

  // ─── summary × 2 ──────────────────────────────────────────────────────────

  {
    id: 'summary-dashboard-overview',
    intent: 'summary',
    complexity: 'simple',
    question: 'Give me a quick overview of the company brain — how many open tasks, active initiatives, and glossary terms do we have?',
    expectedTools: ['brain_dashboard_summary'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustContain: ['task', 'initiative'],
    answerMustNotContain: ['FakeStat', 'SynthCount'],
    description:
      'Agent must call brain_dashboard_summary to produce aggregate counts rather than guessing numbers.',
  },

  {
    id: 'summary-blocked-tasks',
    intent: 'summary',
    complexity: 'simple',
    question: 'How many tasks are currently blocked, and what are they?',
    expectedTools: ['brain_list_tasks'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['FakeTask', 'SynthBlocker', 'GhostTicket'],
    description:
      'Agent must call brain_list_tasks with status=blocked; must not invent task titles or counts.',
  },

  // ─── Extra: cross-intent edge cases ───────────────────────────────────────

  {
    id: 'lookup-decisions-accepted',
    intent: 'lookup',
    complexity: 'simple',
    question: 'Show me all decisions that have been accepted so far.',
    expectedTools: ['brain_list_decisions'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['FakeDecision', 'SynthRecord', 'GhostEntry'],
    description:
      'Agent must call brain_list_decisions with status=accepted; validates that it uses the correct status filter.',
  },

  {
    id: 'summary-all-glossary-terms',
    intent: 'summary',
    complexity: 'simple',
    question: 'List all the glossary terms we currently have in the company brain.',
    expectedTools: ['brain_list_glossary'],
    forbiddenTools: ['brain_create_note', 'brain_create_task'],
    answerMustNotContain: ['FakeTerm', 'SynthDefinition'],
    description:
      'Agent must call brain_list_glossary to enumerate terms rather than reciting definitions from training data.',
  },
]
