/**
 * Wire branding tools into the real `@modelcontextprotocol/sdk` server.
 *
 * This is the concrete adapter used by `lib/mcp/server.ts`. The generic
 * adapter in `./mcp-tools.ts` is a looser interface for environments
 * without the SDK — keep both.
 *
 * Scopes: all tools require `branding:read`. Writes (future) would use
 * `branding:write`.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import {
  handleBrandingListProfiles,
  handleBrandingGetProfile,
  handleBrandingGetMessaging,
  handleBrandingAudit,
  handleBrandingCheckContrast,
} from './mcp-tools';

function json(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function denied(scope: string) {
  return {
    content: [{ type: 'text' as const, text: `Permission denied: this API key lacks the "${scope}" scope.` }],
    isError: true,
  };
}

export function registerBrandingToolsOnSdk(server: McpServer, ctx: PortalMcpContext) {
  const clientId = ctx.client.id;
  const gate = () => (hasScope(ctx.scopes, 'branding:read') ? null : denied('branding:read'));

  server.registerTool(
    'branding_list_profiles',
    {
      title: 'List branding profiles',
      description: 'List branding profiles for the authenticated client.',
      inputSchema: {},
    },
    async () => {
      const blocked = gate();
      if (blocked) return blocked;
      return json(await handleBrandingListProfiles({ clientId }));
    },
  );

  server.registerTool(
    'branding_get_profile',
    {
      title: 'Get branding profile',
      description: 'Get a full branding profile (colors, fonts, logos, button style). Omit profileId for the default profile.',
      inputSchema: {
        profileId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      const blocked = gate();
      if (blocked) return blocked;
      return json(await handleBrandingGetProfile({ clientId }, args));
    },
  );

  server.registerTool(
    'branding_get_messaging',
    {
      title: 'Get brand messaging',
      description: 'Fetch tagline, value proposition, elevator pitch, tone, voice samples, differentiators.',
      inputSchema: {
        profileId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      const blocked = gate();
      if (blocked) return blocked;
      return json(await handleBrandingGetMessaging({ clientId }, args));
    },
  );

  server.registerTool(
    'branding_audit',
    {
      title: 'Audit branding profile',
      description: 'Run the rule-based consistency audit. Returns WCAG contrast issues, missing-field warnings, and structural problems.',
      inputSchema: {
        profileId: z.number().int().positive(),
      },
    },
    async (args) => {
      const blocked = gate();
      if (blocked) return blocked;
      return json(await handleBrandingAudit({ clientId }, args));
    },
  );

  server.registerTool(
    'branding_check_contrast',
    {
      title: 'Check WCAG contrast',
      description: 'Compute WCAG contrast ratio between two CSS colors. Returns ratio plus AA/AAA pass/fail.',
      inputSchema: {
        foreground: z.string().min(1).describe('Foreground color (hex, rgb, or rgba).'),
        background: z.string().min(1).describe('Background color (hex, rgb, or rgba).'),
      },
    },
    async (args) => {
      const blocked = gate();
      if (blocked) return blocked;
      return json(handleBrandingCheckContrast({ clientId }, args));
    },
  );
}
