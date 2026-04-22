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
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brandingProfiles, brandingMessaging } from '@/lib/db/schema';
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

  hasScope(ctx.scopes, 'branding:read') && server.registerTool(
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

  hasScope(ctx.scopes, 'branding:read') && server.registerTool(
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

  hasScope(ctx.scopes, 'branding:read') && server.registerTool(
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

  hasScope(ctx.scopes, 'branding:read') && server.registerTool(
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

  hasScope(ctx.scopes, 'branding:read') && server.registerTool(
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

  // ── WRITES (branding:write) ─────────────────────────────────────────────
  const writeGate = () => (hasScope(ctx.scopes, 'branding:write') ? null : denied('branding:write'));
  const revalidate = () => { try { revalidatePath('/portal', 'layout'); } catch { /* ignore */ } };

  hasScope(ctx.scopes, 'branding:write') && server.registerTool(
    'branding_create_profile',
    {
      title: 'Create branding profile',
      description:
        'Create a new brand profile with colors, fonts, and logos. Pass isDefault:true to make it the client\'s default (unsets others).',
      inputSchema: {
        name: z.string().min(1),
        isDefault: z.boolean().optional(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        backgroundColor: z.string().optional(),
        textColor: z.string().optional(),
        headingFont: z.string().optional(),
        bodyFont: z.string().optional(),
        logoUrl: z.string().optional(),
        logoText: z.string().optional(),
        logoSquareUrl: z.string().optional(),
        logoRectUrl: z.string().optional(),
        logoIconUrl: z.string().optional(),
        logoAlt: z.string().optional(),
      },
    },
    async (args) => {
      const blocked = writeGate();
      if (blocked) return blocked;
      if (args.isDefault) {
        await db.update(brandingProfiles)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.isDefault, true)));
      }
      const [row] = await db.insert(brandingProfiles).values({
        clientId,
        name: args.name.trim(),
        isDefault: args.isDefault ?? false,
        primaryColor: args.primaryColor ?? '#2563eb',
        secondaryColor: args.secondaryColor ?? '#1e40af',
        accentColor: args.accentColor ?? '#f59e0b',
        backgroundColor: args.backgroundColor ?? '#ffffff',
        textColor: args.textColor ?? '#111827',
        headingFont: args.headingFont ?? null,
        bodyFont: args.bodyFont ?? null,
        logoUrl: args.logoUrl ?? null,
        logoText: args.logoText ?? null,
        logoSquareUrl: args.logoSquareUrl ?? null,
        logoRectUrl: args.logoRectUrl ?? null,
        logoIconUrl: args.logoIconUrl ?? null,
        logoAlt: args.logoAlt ?? null,
      }).returning();
      revalidate();
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'branding:write') && server.registerTool(
    'branding_update_profile',
    {
      title: 'Update branding profile',
      description: 'Update any combination of colors, fonts, logos, or the isDefault flag on an existing profile.',
      inputSchema: {
        profileId: z.number().int().positive(),
        name: z.string().min(1).optional(),
        isDefault: z.boolean().optional(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        backgroundColor: z.string().optional(),
        textColor: z.string().optional(),
        headingFont: z.string().nullable().optional(),
        bodyFont: z.string().nullable().optional(),
        logoUrl: z.string().nullable().optional(),
        logoText: z.string().nullable().optional(),
        logoSquareUrl: z.string().nullable().optional(),
        logoRectUrl: z.string().nullable().optional(),
        logoIconUrl: z.string().nullable().optional(),
        logoAlt: z.string().nullable().optional(),
        borderRadius: z.string().optional(),
        linkColor: z.string().nullable().optional(),
        linkHoverColor: z.string().nullable().optional(),
      },
    },
    async ({ profileId, isDefault, ...rest }) => {
      const blocked = writeGate();
      if (blocked) return blocked;
      const [existing] = await db.select({ id: brandingProfiles.id, isDefault: brandingProfiles.isDefault })
        .from(brandingProfiles)
        .where(and(eq(brandingProfiles.id, profileId), eq(brandingProfiles.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Profile not found' });
      if (isDefault && !existing.isDefault) {
        await db.update(brandingProfiles)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.isDefault, true)));
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (isDefault !== undefined) patch.isDefault = isDefault;
      const [row] = await db.update(brandingProfiles).set(patch)
        .where(eq(brandingProfiles.id, profileId)).returning();
      revalidate();
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'branding:write') && server.registerTool(
    'branding_update_messaging',
    {
      title: 'Update brand messaging',
      description:
        'Update the client\'s brand voice / copy context (tagline, elevator pitch, value prop, tone, target audience, differentiators). Creates the row if it doesn\'t exist. Pass profileId to scope messaging to a specific brand profile; omit for the client-level default.',
      inputSchema: {
        profileId: z.number().int().positive().optional(),
        companyName: z.string().optional(),
        tagline: z.string().optional(),
        missionStatement: z.string().optional(),
        visionStatement: z.string().optional(),
        valueProposition: z.string().optional(),
        elevatorPitch: z.string().optional(),
        boilerplate: z.string().optional(),
        toneOfVoice: z.string().optional(),
        brandPersonality: z.string().optional(),
        writingStyle: z.string().optional(),
        keyDifferentiators: z.array(z.string()).optional(),
        targetAudience: z.string().optional(),
        industry: z.string().optional(),
      },
    },
    async ({ profileId, ...rest }) => {
      const blocked = writeGate();
      if (blocked) return blocked;
      const filter = profileId
        ? and(eq(brandingMessaging.clientId, clientId), eq(brandingMessaging.brandingProfileId, profileId))
        : eq(brandingMessaging.clientId, clientId);
      const [existing] = await db.select({ id: brandingMessaging.id }).from(brandingMessaging).where(filter).limit(1);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (existing) {
        const [row] = await db.update(brandingMessaging).set(patch)
          .where(eq(brandingMessaging.id, existing.id)).returning();
        revalidate();
        return json(row);
      }
      const [row] = await db.insert(brandingMessaging).values({
        clientId,
        brandingProfileId: profileId ?? null,
        ...patch,
      } as typeof brandingMessaging.$inferInsert).returning();
      revalidate();
      return json(row);
    },
  );
}
