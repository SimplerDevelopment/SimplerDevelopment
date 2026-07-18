/**
 * Typed registry types for the SimplerDevelopment Agentic OS.
 *
 * Source-of-truth taxonomy is `.planning/agentic-os.md`. The registry in
 * `./registry.ts` is the typed projection that the admin catalog UI, the
 * headless executor, and the schedule planner all read from.
 */

export type AgenticOsDomain =
  | 'developer-workflow'
  | 'cms-blocks'
  | 'visual-editor'
  | 'site-migration'
  | 'testing'
  | 'mcp-server'
  | 'content-research'
  | 'qa-visual'
  | 'kb-vault'
  | 'automations-cron';

export type AgenticOsTrigger = 'on-demand' | 'scheduled' | 'cloud';

// Discriminated union — different sources resolve differently in the executor.
export type AgenticOsSource =
  | { kind: 'repo-skill'; path: string }            // .claude/skills/<id>/SKILL.md
  | { kind: 'vendored-skill'; path: string }        // .agents/skills/<id>/
  | { kind: 'user-skill'; path: string }            // ~/.claude/skills/<id>/SKILL.md
  | { kind: 'subagent'; name: string }              // dispatched via Agent tool
  | { kind: 'cron-route'; path: string; schedule: string };

export interface AgenticOsVariable {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  type?: 'text' | 'textarea' | 'url' | 'select';
  options?: string[]; // when type === 'select'
}

export interface AgenticOsRule {
  id: string;
  title: string;
  body: string;
}

interface BaseSkill {
  id: string;
  domain: AgenticOsDomain;
  name: string;
  description: string;
  source: AgenticOsSource;
  icon: string;                  // Material Icons name (not emoji)
  estimatedRuntime?: string;     // '1-3 min', '5-10 min', '30+ min'
  appliesRules?: string[];       // rule ids from RULES
}

export interface OnDemandSkill extends BaseSkill {
  trigger: 'on-demand';
  promptTemplate: string;        // can contain {{variable}} placeholders
  variables: AgenticOsVariable[];
}

export interface ScheduledSkill extends BaseSkill {
  trigger: 'scheduled';
  cronExpression: string;        // canonical cron string from vercel.json
  manualRunPath?: string;        // optional: /api/cron/<name> for an ad-hoc trigger
}

export interface CloudSkill extends BaseSkill {
  trigger: 'cloud';
  webhookPath?: string;
}

export type AgenticOsSkill = OnDemandSkill | ScheduledSkill | CloudSkill;

// Type guard helpers
export const isOnDemand = (s: AgenticOsSkill): s is OnDemandSkill => s.trigger === 'on-demand';
export const isScheduled = (s: AgenticOsSkill): s is ScheduledSkill => s.trigger === 'scheduled';
export const isCloud = (s: AgenticOsSkill): s is CloudSkill => s.trigger === 'cloud';

export const DOMAIN_LABELS: Record<AgenticOsDomain, string> = {
  'developer-workflow': 'Developer Workflow',
  'cms-blocks': 'CMS Blocks',
  'visual-editor': 'Visual Editor',
  'site-migration': 'Site Migration',
  'testing': 'Testing',
  'mcp-server': 'MCP Server',
  'content-research': 'Content & Research',
  'qa-visual': 'QA / Visual',
  'kb-vault': 'KB Vault',
  'automations-cron': 'Scheduled Automations',
};

/**
 * Render a prompt template by substituting `{{key}}` with values from the
 * provided record. Behavior:
 *   - missing or empty-string values leave the literal `{{key}}` placeholder
 *     in place so callers can spot what wasn't provided.
 *   - unknown placeholders (keys not in `values`) pass through unchanged.
 */
export function renderPromptTemplate(
  template: string,
  values: Record<string, string | undefined>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (m, key) => {
    const v = values[key];
    return v && v.length > 0 ? v : m;
  });
}
