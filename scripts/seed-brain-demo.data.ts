/**
 * Seed descriptors for scripts/seed-brain-demo.ts.
 *
 * Pure, static demo data — no DB access, no runtime ids. Cross-entity links are
 * expressed as stable string keys (companyName, contactEmail, meetingSourceRef,
 * stage) that the orchestrator resolves to real ids at insert time. Edit the
 * demo content here; the upsert/orchestration logic lives in the sibling script.
 */

export const PROFILE_SEED = {
  name: 'Demo Brain',
  industryTemplate: 'wealth_advisory',
  enabled: true,
  defaultConfidentiality: 'standard',
  enabledModules: {
    meetings: true,
    tasks: true,
    prospects: true,
    knowledge: true,
    ask: true,
    automations: true,
    calendar: true,
  },
  serviceLines: ['Investments & Planning', 'Family Business'],
} as const;

export const COMPANY_SEEDS: Array<{ name: string; domain: string; industry: string }> = [
  { name: 'Acme Wealth Partners', domain: 'acmewealth.example.com', industry: 'Wealth Advisory' },
  { name: 'Sunrise Family Office', domain: 'sunrisefo.example.com', industry: 'Family Office' },
];

export const CONTACT_SEEDS: Array<{ company: string; firstName: string; lastName: string; email: string; title: string }> = [
  { company: 'Acme Wealth Partners', firstName: 'Jordan', lastName: 'Reyes', email: 'jordan@acmewealth.example.com', title: 'Managing Partner' },
  { company: 'Acme Wealth Partners', firstName: 'Priya', lastName: 'Shah', email: 'priya@acmewealth.example.com', title: 'Director of Operations' },
  { company: 'Sunrise Family Office', firstName: 'Eleanor', lastName: 'Park', email: 'eleanor@sunrisefo.example.com', title: 'Family Office Lead' },
  { company: 'Sunrise Family Office', firstName: 'Marcus', lastName: 'Nguyen', email: 'marcus@sunrisefo.example.com', title: 'Investment Analyst' },
];

export const DEAL_SEEDS: Array<{
  title: string;
  stage: 'lead' | 'proposal';
  companyName: string;
  contactEmail: string;
  value: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}> = [
  {
    title: 'Acme — Q3 advisory expansion',
    stage: 'lead',
    companyName: 'Acme Wealth Partners',
    contactEmail: 'jordan@acmewealth.example.com',
    value: 4500000, // $45,000
    priority: 'medium',
  },
  {
    title: 'Sunrise — proposal sent for FO retainer',
    stage: 'proposal',
    companyName: 'Sunrise Family Office',
    contactEmail: 'eleanor@sunrisefo.example.com',
    value: 12000000, // $120,000
    priority: 'high',
  },
];

export const OVERLAY_SEEDS: Array<{
  companyName: string;
  relationshipType: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  currentPriorities: string;
  openLoops: string;
  serviceLines: string[];
  staleAfterDays: number;
}> = [
  {
    companyName: 'Acme Wealth Partners',
    relationshipType: 'plan_sponsor',
    priority: 'high',
    summary: 'Multi-generational wealth advisory engagement. Primary sponsor: Jordan Reyes.',
    currentPriorities: 'Q3 portfolio rebalance; onboarding of family business succession plan.',
    openLoops: 'Awaiting compliance sign-off on tax overlay strategy; follow-up call scheduled.',
    serviceLines: ['Investments & Planning', 'Family Business'],
    staleAfterDays: 30,
  },
  {
    companyName: 'Sunrise Family Office',
    relationshipType: 'household',
    priority: 'critical',
    summary: 'Single-family office covering investments, estate planning, and crypto education.',
    currentPriorities: 'Finalize discovery deliverables; confirm proposal scope.',
    openLoops: 'Need IPS draft from CIO; pending answer on crypto allocation tolerance.',
    serviceLines: ['Investments & Planning', 'Cryptocurrency Education'],
    staleAfterDays: 21,
  },
];

export const MEETING_SEEDS: Array<{
  title: string;
  sourceRef: string;
  status: 'approved' | 'needs_review' | 'draft';
  companyName: string | null;
  transcript: string;
  aiSummary: string | null;
  humanSummary: string | null;
}> = [
  {
    title: 'Acme Q3 Strategy Review',
    sourceRef: 'demo:acme-q3-strategy',
    status: 'approved',
    companyName: 'Acme Wealth Partners',
    transcript: 'Jordan walked through Q3 priorities: rebalance the portfolio toward fixed income and finalize the succession plan for the family business. Action items captured.',
    aiSummary: 'Q3 priorities: portfolio rebalance toward fixed income; succession plan finalization. Two follow-ups committed: send revised IPS by Friday; schedule estate counsel call.',
    humanSummary: 'Confirmed Q3 priorities and committed to two follow-ups. Reviewed and approved.',
  },
  {
    title: 'Sunrise Discovery Call',
    sourceRef: 'demo:sunrise-discovery',
    status: 'needs_review',
    companyName: 'Sunrise Family Office',
    transcript: 'Eleanor described the family office structure and current gaps: no formal IPS, ad-hoc crypto exposure, estate plan last refreshed 7 years ago.',
    aiSummary: 'Discovery surfaced three gaps: missing IPS, unmanaged crypto exposure, dated estate plan. Proposal scope should cover all three.',
    humanSummary: null,
  },
  {
    title: 'Internal — Compliance Calibration',
    sourceRef: 'demo:internal-compliance',
    status: 'draft',
    companyName: null,
    transcript: 'Pending — transcript not yet pasted in.',
    aiSummary: null,
    humanSummary: null,
  },
];

export const TASK_SEEDS: Array<{
  title: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description: string;
  blockedReason?: string;
  companyName?: string;
  meetingSourceRef?: string;
}> = [
  {
    title: 'Send revised IPS to Acme',
    status: 'open',
    priority: 'high',
    description: 'Per Q3 review — incorporate fixed-income shift.',
    companyName: 'Acme Wealth Partners',
    meetingSourceRef: 'demo:acme-q3-strategy',
  },
  {
    title: 'Schedule estate counsel call for Acme succession plan',
    status: 'in_progress',
    priority: 'medium',
    description: 'Coordinate with external counsel. Target: end of week.',
    companyName: 'Acme Wealth Partners',
  },
  {
    title: 'Draft IPS for Sunrise',
    status: 'blocked',
    priority: 'high',
    description: 'Discovery surfaced no formal IPS.',
    blockedReason: 'Awaiting CIO input on crypto allocation tolerance.',
    companyName: 'Sunrise Family Office',
    meetingSourceRef: 'demo:sunrise-discovery',
  },
  {
    title: 'Refresh Sunrise estate plan',
    status: 'open',
    priority: 'medium',
    description: 'Plan last refreshed 7 years ago — flag to estate team.',
    companyName: 'Sunrise Family Office',
  },
  {
    title: 'Confirm Q3 advisory expansion budget approval',
    status: 'done',
    priority: 'low',
    description: 'Internal sign-off from finance — completed last week.',
    companyName: 'Acme Wealth Partners',
  },
];

export const NOTE_SEEDS: Array<{ title: string; body: string; tags: string[]; companyName?: string }> = [
  {
    title: 'Discovery checklist — Sunrise',
    body: '- Family structure mapped\n- Asset inventory pulled\n- Current IPS: none\n- Crypto exposure: ~12%\n- Estate plan: last refreshed 2019',
    tags: ['kb/discovery', 'kb/discovery/sunrise'],
    companyName: 'Sunrise Family Office',
  },
  {
    title: 'Acme onboarding playbook',
    body: 'Standard onboarding flow for plan-sponsor relationships. 4 phases: discovery → IPS → implementation → review.',
    tags: ['kb/discovery', 'kb/discovery/playbooks'],
    companyName: 'Acme Wealth Partners',
  },
  {
    title: 'Marketing — referral partner outreach script',
    body: 'Cold outreach template for CPA referral partners. Lead with shared-client framing.',
    tags: ['kb/marketing', 'kb/marketing/outreach'],
  },
  {
    title: 'Marketing — Q3 content calendar',
    body: 'Three-pillar content plan for Q3: market commentary, succession planning, crypto education.',
    tags: ['kb/marketing', 'kb/marketing/content'],
  },
];

export const TEMPLATE_SEEDS: Array<{
  name: string;
  body: string;
  trigger: 'manual' | 'daily';
  defaultTags: string[];
}> = [
  {
    name: 'Daily standup',
    body: '## What I did yesterday\n\n## What I am doing today\n\n## Blockers\n',
    trigger: 'daily',
    defaultTags: ['daily', 'standup'],
  },
  {
    name: 'Discovery call notes',
    body: '## Attendees\n\n## Goals\n\n## Pain points\n\n## Action items\n\n## Follow-up date\n',
    trigger: 'manual',
    defaultTags: ['kb/discovery'],
  },
];

export const SAVED_SEARCH_SEED = {
  name: 'Discovery folder',
  icon: 'folder',
  filters: {
    tagPrefix: 'kb/discovery',
    sort: 'updated',
    order: 'desc',
  },
  sortOrder: 0,
} as const;

export const DECISION_SEEDS: Array<{
  title: string;
  context: string;
  decision: string;
  rationale: string;
  status: 'accepted' | 'proposed' | 'superseded';
  reversibility: 'two_way' | 'one_way';
  companyName?: string;
}> = [
  {
    title: 'Adopt fixed-income tilt for Acme Q3 portfolios',
    context: 'Rising rate environment and Acme\'s conservative risk profile discussed in Q3 strategy review.',
    decision: 'Shift Acme\'s portfolio allocation 10% from equities to investment-grade fixed income effective Q3.',
    rationale: 'Client risk tolerance and current macro environment both point to reduced equity exposure. IPS revision approved by Jordan Reyes.',
    status: 'accepted',
    reversibility: 'two_way',
    companyName: 'Acme Wealth Partners',
  },
  {
    title: 'Include crypto allocation guidance in Sunrise IPS',
    context: 'Discovery call surfaced ~12% unmanaged crypto exposure with no formal policy.',
    decision: 'Propose a 5–10% crypto allocation ceiling with quarterly review cadence in the Sunrise IPS draft.',
    rationale: 'Addresses the gap identified in discovery; aligns with family office risk appetite and provides a defensible governance framework.',
    status: 'proposed',
    reversibility: 'two_way',
    companyName: 'Sunrise Family Office',
  },
  {
    title: 'Use email-only updates for Acme quarterly reports',
    context: 'Original process required mailed paper reports per legacy client preference.',
    decision: 'Superseded by decision to adopt the client portal for all Acme reporting. Paper mail discontinued.',
    rationale: 'Acme onboarding to portal completed; Jordan confirmed digital-only preference. Legacy decision archived.',
    status: 'superseded',
    reversibility: 'one_way',
    companyName: 'Acme Wealth Partners',
  },
];

export const PEOPLE_SEEDS: Array<{
  fullName: string;
  email: string;
  title: string;
}> = [
  { fullName: 'Alexandra Whitfield', email: 'awhitfield@demo.simplerdevelopment.com', title: 'Lead Financial Advisor' },
  { fullName: 'Samuel Okonkwo',      email: 'sokonkwo@demo.simplerdevelopment.com',  title: 'Paraplanner' },
  { fullName: 'Diana Castillo',      email: 'dcastillo@demo.simplerdevelopment.com', title: 'Chief Compliance Officer' },
  { fullName: 'Raj Mehta',           email: 'rmehta@demo.simplerdevelopment.com',    title: 'Operations Lead' },
];

export const GLOSSARY_SEEDS: Array<{
  term: string;
  slug: string;
  definition: string;
  shortDefinition: string;
  category: string;
}> = [
  {
    term: 'AUM',
    slug: 'aum',
    definition: 'Assets Under Management (AUM) is the total market value of investments that a financial advisor or firm manages on behalf of clients. It is a key metric for sizing a wealth advisory practice.',
    shortDefinition: 'Total market value of client assets managed by the firm.',
    category: 'metrics',
  },
  {
    term: 'RIA',
    slug: 'ria',
    definition: 'A Registered Investment Advisor (RIA) is an individual or firm registered with the SEC or state regulators that provides investment advice for compensation and owes a fiduciary duty to clients.',
    shortDefinition: 'SEC- or state-registered firm that provides investment advice as a fiduciary.',
    category: 'regulatory',
  },
  {
    term: 'Fiduciary',
    slug: 'fiduciary',
    definition: 'A fiduciary is a person or organization legally obligated to act in the best interests of another party. In wealth management, RIAs are fiduciaries; broker-dealers historically operated under the lower suitability standard.',
    shortDefinition: 'Legal obligation to act in a client\'s best interest.',
    category: 'regulatory',
  },
  {
    term: 'Form ADV',
    slug: 'form-adv',
    definition: 'Form ADV is the uniform form used by investment advisers to register with the SEC and state securities authorities. It discloses the firm\'s business, ownership, clients, employees, business practices, affiliations, and any disciplinary events.',
    shortDefinition: 'Regulatory disclosure document filed by RIAs with the SEC.',
    category: 'regulatory',
  },
];

export const INITIATIVE_SEEDS: Array<{
  name: string;
  description: string;
  status: 'active' | 'planned';
  priority: 'high' | 'medium';
}> = [
  {
    name: 'Client Portal Onboarding — Wealth Advisory Cohort',
    description: 'Migrate all wealth advisory clients onto the client portal by end of Q3. Covers document upload, e-signature workflows, and quarterly report delivery.',
    status: 'active',
    priority: 'high',
  },
  {
    name: 'Estate Planning Service Line Launch',
    description: 'Stand up an estate planning service offering in partnership with external counsel. Target launch Q4. Includes fee schedule, referral workflow, and compliance sign-off.',
    status: 'planned',
    priority: 'medium',
  },
];
