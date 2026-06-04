/**
 * Curated voice-assistant tool set.
 *
 * The portal MCP server exposes ~300 tools, but (a) their handlers are bound to
 * the MCP transport and aren't programmatically dispatchable, and (b) the OpenAI
 * Realtime API has a practical ceiling on tool count. So instead of auto-exposing
 * everything, we hand-pick a small, high-value set of voice actions and back each
 * one with an EXISTING internal portal REST route — forwarding the caller's
 * session cookie so auth, tenancy, validation, and the `{ success, data }`
 * envelope all stay in one place (no duplicated business logic).
 *
 * Each tool declares:
 *  - `parameters` as JSON Schema (the format the Realtime session config wants),
 *  - a portal `action` level enforced by `authorizePortal` in the dispatcher,
 *  - `requiresConfirm` for mutations (gated behind a signed confirm token),
 *  - `summarize()` to produce the human-readable confirm-card text,
 *  - `execute()` which calls the internal route and returns a compact result.
 *
 * Keep results SMALL — they're spoken aloud and fed back into the model's
 * context, so trim to the fields that matter.
 */
import type { PortalAction } from '@/lib/portal-auth';

export interface VoiceToolContext {
  /** Absolute origin of the incoming request, e.g. https://acme.simplerdevelopment.com */
  origin: string;
  /** Raw Cookie header forwarded to the internal route so it authenticates as this user. */
  cookie: string;
}

export interface VoiceTool {
  name: string;
  description: string;
  /** JSON Schema for the function arguments (OpenAI function-calling format). */
  parameters: Record<string, unknown>;
  /** Minimum portal role action level required (enforced via authorizePortal). */
  action: PortalAction;
  /** Mutations must be confirmed by the user before execution. */
  requiresConfirm: boolean;
  /** One-line, human-readable description of the pending action for the confirm card. */
  summarize?: (args: Record<string, unknown>) => string;
  /** Run the tool. Throws on failure; the dispatcher converts that to a tool error. */
  execute: (args: Record<string, unknown>, ctx: VoiceToolContext) => Promise<unknown>;
}

/** Call an internal portal REST route as the current user (cookie forwarded). */
async function callPortal(
  ctx: VoiceToolContext,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${ctx.origin}${path}`, {
    method,
    headers: {
      cookie: ctx.cookie,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Internal call — never cache.
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: unknown; message?: string }
    | null;
  if (!res.ok || !json || json.success === false) {
    throw new Error(json?.message || `Request to ${path} failed (${res.status})`);
  }
  // Some routes return `{ success, data }`, others `{ success, ...fields }`.
  return json.data !== undefined ? json.data : json;
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function clampLimit(args: Record<string, unknown>, fallback: number, max: number): number {
  const n = Number(args.limit);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

export const VOICE_TOOLS: VoiceTool[] = [
  // ─────────────────────────── Read / advisory ───────────────────────────
  {
    name: 'search_brain',
    description:
      "Search the client's Company Brain (notes, meetings, decisions, documents, people) for anything the user asks about. Use for 'what did we decide about X', 'find the note on Y', 'who knows about Z'.",
    action: 'read',
    requiresConfirm: false,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language search query.' },
        limit: { type: 'number', description: 'Max results (default 5, max 15).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const q = str(args, 'query') ?? '';
      const limit = clampLimit(args, 5, 15);
      return callPortal(
        ctx,
        'GET',
        `/api/portal/brain/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      );
    },
  },
  {
    name: 'list_open_deals',
    description:
      "List the client's currently open CRM deals (sales opportunities). Use for 'what deals are open', 'what's in the pipeline'.",
    action: 'read',
    requiresConfirm: false,
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max deals (default 10, max 25).' } },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const limit = clampLimit(args, 10, 25);
      const data = (await callPortal(
        ctx,
        'GET',
        `/api/portal/crm/deals?status=open&limit=${limit}`,
      )) as { deals?: unknown[] } | unknown[];
      const deals = Array.isArray(data) ? data : (data.deals ?? []);
      return (deals as Array<Record<string, unknown>>).slice(0, limit).map((d) => ({
        id: d.id,
        title: d.title,
        value: d.value,
        stage: (d.stage as Record<string, unknown> | undefined)?.name ?? d.stageId,
      }));
    },
  },
  {
    name: 'search_contacts',
    description:
      "Search the client's CRM contacts by name, email, or company. Use for 'find John's contact', 'look up the contact at Acme'.",
    action: 'read',
    requiresConfirm: false,
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Name, email, or company to search for.' },
        limit: { type: 'number', description: 'Max contacts (default 5, max 15).' },
      },
      required: ['search'],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const search = str(args, 'search') ?? '';
      const limit = clampLimit(args, 5, 15);
      const data = (await callPortal(
        ctx,
        'GET',
        `/api/portal/crm/contacts?search=${encodeURIComponent(search)}&limit=${limit}`,
      )) as { contacts?: unknown[] } | unknown[];
      const contacts = Array.isArray(data) ? data : (data.contacts ?? []);
      return (contacts as Array<Record<string, unknown>>).slice(0, limit).map((c) => ({
        id: c.id,
        name: [c.firstName, c.lastName].filter(Boolean).join(' '),
        email: c.email,
        title: c.title,
      }));
    },
  },
  {
    name: 'list_my_tasks',
    description:
      "List the tasks assigned to the current user. Use for 'what are my tasks', 'what do I need to do'.",
    action: 'read',
    requiresConfirm: false,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async (_args, ctx) => {
      const data = (await callPortal(ctx, 'GET', `/api/portal/my-tasks`)) as
        | { tasks?: unknown[] }
        | unknown[];
      const tasks = Array.isArray(data) ? data : (data.tasks ?? []);
      return (tasks as Array<Record<string, unknown>>).slice(0, 25).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
      }));
    },
  },

  // ─────────────────────── Mutating (confirm-gated) ───────────────────────
  {
    name: 'create_contact',
    description:
      'Create a new CRM contact. Use when the user asks to add or save a person to the CRM. Always confirm details before creating.',
    action: 'write',
    requiresConfirm: true,
    parameters: {
      type: 'object',
      properties: {
        firstName: { type: 'string', description: "Contact's first name (required)." },
        lastName: { type: 'string', description: "Contact's last name." },
        email: { type: 'string', description: 'Email address.' },
        phone: { type: 'string', description: 'Phone number.' },
        title: { type: 'string', description: 'Job title.' },
        notes: { type: 'string', description: 'Freeform notes about the contact.' },
      },
      required: ['firstName'],
      additionalProperties: false,
    },
    summarize: (args) => {
      const name = [str(args, 'firstName'), str(args, 'lastName')].filter(Boolean).join(' ');
      const extra = [str(args, 'email'), str(args, 'title')].filter(Boolean).join(', ');
      return `Create CRM contact "${name}"${extra ? ` (${extra})` : ''}?`;
    },
    execute: async (args, ctx) => {
      const data = await callPortal(ctx, 'POST', `/api/portal/crm/contacts`, {
        firstName: str(args, 'firstName'),
        lastName: str(args, 'lastName'),
        email: str(args, 'email'),
        phone: str(args, 'phone'),
        title: str(args, 'title'),
        notes: str(args, 'notes'),
      });
      const c = data as Record<string, unknown>;
      return { id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(' ') };
    },
  },
  {
    name: 'create_task',
    description:
      'Create a new task in the Company Brain. Use when the user asks to add a to-do, action item, or follow-up. Always confirm before creating.',
    action: 'write',
    requiresConfirm: true,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short task title (required).' },
        description: { type: 'string', description: 'Optional details.' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority (default medium).',
        },
        dueDate: { type: 'string', description: 'Optional due date, ISO format (YYYY-MM-DD).' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    summarize: (args) => {
      const p = str(args, 'priority');
      const due = str(args, 'dueDate');
      return `Create task "${str(args, 'title')}"${p ? ` [${p}]` : ''}${due ? ` due ${due}` : ''}?`;
    },
    execute: async (args, ctx) => {
      const data = await callPortal(ctx, 'POST', `/api/portal/brain/tasks`, {
        title: str(args, 'title'),
        description: str(args, 'description'),
        priority: str(args, 'priority'),
        dueDate: str(args, 'dueDate'),
      });
      const t = data as Record<string, unknown>;
      return { id: t.id, title: t.title };
    },
  },
];

const TOOL_BY_NAME = new Map(VOICE_TOOLS.map((t) => [t.name, t]));

export function getVoiceTool(name: string): VoiceTool | undefined {
  return TOOL_BY_NAME.get(name);
}

/** Tool definitions in the shape the OpenAI Realtime session config expects. */
export function voiceToolsForRealtime(): Array<{
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return VOICE_TOOLS.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
