/**
 * SD Chat — chat types
 *
 * Mirrors the rows returned by the SimplerDevelopment portal at
 * `/api/portal/ai/conversations` (list) and `/api/portal/ai/conversations/[id]`
 * (detail). Shapes match the Drizzle table definitions in
 * `lib/db/schema/billing.ts` (`ai_conversations` + `ai_messages`).
 *
 * The portal returns raw timestamps as ISO strings over JSON, so all date
 * fields are typed as `string` here. Callers convert via `new Date(...)`.
 *
 * NOTE — Phase 4 wiring only:
 *  - The portal does not yet expose DELETE or PATCH on the conversations
 *    routes. Mutation hooks in `lib/api/conversations.ts` are scaffolded
 *    against the eventual REST shape but will currently surface a clear
 *    "not implemented" error. A follow-up PR on sd2026 must add the routes.
 *  - There is no read field for `unreadCount` on AI conversations (the
 *    backend has no concept of read state). Surfaced as `undefined`.
 */

/** Raw row from `ai_conversations`. */
export interface AiConversation {
  id: number;
  clientId: number;
  title: string;
  flagged: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  updatedAt: string;
}

/** Raw row from `ai_messages`. */
export interface AiMessage {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant' | string;
  content: string;
  toolCalls:
    | { name: string; input: Record<string, unknown>; result: unknown }[]
    | null;
  injectedBy: number | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

/** Shape returned by `GET /api/portal/ai/conversations/[id]`. */
export interface AiConversationDetail {
  conversation: AiConversation;
  messages: AiMessage[];
}
