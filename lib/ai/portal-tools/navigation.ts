/**
 * Navigation AI tool — purely UI-side, no DB writes.
 */
import type Anthropic from '@anthropic-ai/sdk';

export const navigationTools: Anthropic.Tool[] = [
  {
    name: 'navigate_to',
    description: `Navigate the user to a specific portal page and optionally focus a UI section. Use this when the user wants to go somewhere, or when an action is better done through the UI (e.g. paying an invoice, editing a page in the block editor, uploading media, connecting Google, managing email campaign design).

Available routes:
- /portal/dashboard
- /portal/projects
- /portal/projects/{id} (optionally with section: board, files, sprints)
- /portal/billing (optionally with section: invoices, payment-methods)
- /portal/tickets
- /portal/tickets/new
- /portal/tickets/{id}
- /portal/services
- /portal/services/{id}/request
- /portal/websites
- /portal/websites/{id}
- /portal/websites/{id}/posts/new
- /portal/websites/{id}/posts/{postId}/edit
- /portal/websites/{id}/categories
- /portal/websites/{id}/tags
- /portal/websites/{id}/media
- /portal/websites/{id}/settings
- /portal/hosting
- /portal/hosting/{id}
- /portal/email/campaigns
- /portal/email/campaigns/new
- /portal/email/campaigns/{id}
- /portal/email/lists
- /portal/tools/pitch-decks
- /portal/tools/pitch-decks/new
- /portal/tools/pitch-decks/{id}
- /portal/tools/booking
- /portal/tools/booking/new
- /portal/tools/booking/{id}
- /portal/suggested-projects
- /portal/suggested-projects/{id}
- /portal/suggested-projects/{id}/request
- /portal/team
- /portal/settings/profile`,
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'The portal route path to navigate to (e.g. /portal/projects/5)' },
        section: { type: 'string', description: 'Optional UI section to focus/highlight (e.g. "board", "files", "sprints", "invoices", "payment-methods")' },
        message: { type: 'string', description: 'Brief instruction to the user about what to do on that page' },
      },
      required: ['path'],
    },
  },
];

export type NavigationHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const navigationHandlers: Record<string, NavigationHandler> = {
  navigate_to: async (input, _clientId, _userId) => {
    return {
      action: 'navigate',
      path: input.path,
      section: input.section ?? null,
      message: input.message ?? null,
    };
  },
};
