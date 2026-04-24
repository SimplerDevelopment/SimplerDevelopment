/**
 * MCP tool handlers for branding.
 *
 * DB-backed handlers for the branding MCP tools. Each handler is a pure
 * async function taking `{ clientId }` context + input and returning a
 * JSON-serializable result. Tenant-isolated: every query is scoped to
 * the caller's clientId.
 *
 * Schemas live in `mcp-schemas.ts` so they're importable without pulling
 * in the DB client.
 */

import { db } from '@/lib/db';
import { brandingProfiles, brandingMessaging } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auditBranding, type AuditReport } from './audit';
import { messagingRowToContext, type BrandMessagingContext } from './block-defaults';
import {
  brandingToolSchemas,
  handleBrandingCheckContrast,
  type HandlerContext,
} from './mcp-schemas';

export { brandingToolSchemas, handleBrandingCheckContrast };
export type { BrandingToolName, HandlerContext } from './mcp-schemas';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveProfile(clientId: number, profileId?: number) {
  if (profileId) {
    const [p] = await db
      .select()
      .from(brandingProfiles)
      .where(and(eq(brandingProfiles.id, profileId), eq(brandingProfiles.clientId, clientId)))
      .limit(1);
    return p ?? null;
  }
  const [def] = await db
    .select()
    .from(brandingProfiles)
    .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.isDefault, true)))
    .limit(1);
  if (def) return def;
  const [first] = await db
    .select()
    .from(brandingProfiles)
    .where(eq(brandingProfiles.clientId, clientId))
    .limit(1);
  return first ?? null;
}

async function loadMessaging(clientId: number, profileId?: number): Promise<BrandMessagingContext | undefined> {
  if (profileId) {
    const [scoped] = await db
      .select()
      .from(brandingMessaging)
      .where(and(eq(brandingMessaging.clientId, clientId), eq(brandingMessaging.brandingProfileId, profileId)))
      .limit(1);
    if (scoped) return messagingRowToContext(scoped);
  }
  const [first] = await db
    .select()
    .from(brandingMessaging)
    .where(eq(brandingMessaging.clientId, clientId))
    .limit(1);
  return messagingRowToContext(first);
}

// ─── DB-backed handlers ─────────────────────────────────────────────────────

export async function handleBrandingListProfiles(ctx: HandlerContext) {
  const rows = await db
    .select({
      id: brandingProfiles.id,
      name: brandingProfiles.name,
      isDefault: brandingProfiles.isDefault,
      primaryColor: brandingProfiles.primaryColor,
      accentColor: brandingProfiles.accentColor,
      logoUrl: brandingProfiles.logoUrl,
    })
    .from(brandingProfiles)
    .where(eq(brandingProfiles.clientId, ctx.clientId));
  return { profiles: rows };
}

export async function handleBrandingGetProfile(ctx: HandlerContext, input: { profileId?: number }) {
  const p = await resolveProfile(ctx.clientId, input.profileId);
  if (!p) return { profile: null, message: 'No branding profile found' };
  return {
    profile: {
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      primaryColor: p.primaryColor,
      secondaryColor: p.secondaryColor,
      accentColor: p.accentColor,
      backgroundColor: p.backgroundColor,
      textColor: p.textColor,
      navBackground: p.navBackground,
      navTextColor: p.navTextColor,
      linkColor: p.linkColor,
      linkHoverColor: p.linkHoverColor,
      headingFont: p.headingFont,
      bodyFont: p.bodyFont,
      borderRadius: p.borderRadius,
      logoUrl: p.logoUrl,
      logoSquareUrl: p.logoSquareUrl,
      logoRectUrl: p.logoRectUrl,
      logoIconUrl: p.logoIconUrl,
      faviconUrl: p.faviconUrl,
      ogImageUrl: p.ogImageUrl,
      buttonStyle: p.buttonStyle,
      typography: p.typography,
    },
  };
}

export async function handleBrandingGetMessaging(ctx: HandlerContext, input: { profileId?: number }) {
  const m = await loadMessaging(ctx.clientId, input.profileId);
  if (!m) return { messaging: null, message: 'No messaging row configured for this client.' };
  return { messaging: m };
}

export async function handleBrandingAudit(
  ctx: HandlerContext,
  input: { profileId: number },
): Promise<{ report: AuditReport } | { error: string }> {
  const p = await resolveProfile(ctx.clientId, input.profileId);
  if (!p) return { error: `Profile ${input.profileId} not found for this client.` };
  const messaging = await loadMessaging(ctx.clientId, input.profileId);
  const report = auditBranding({
    profile: {
      name: p.name,
      primaryColor: p.primaryColor ?? undefined,
      secondaryColor: p.secondaryColor ?? undefined,
      accentColor: p.accentColor ?? undefined,
      backgroundColor: p.backgroundColor ?? undefined,
      textColor: p.textColor ?? undefined,
      navBackground: p.navBackground ?? undefined,
      navTextColor: p.navTextColor ?? undefined,
      linkColor: p.linkColor ?? undefined,
      headingFont: p.headingFont ?? undefined,
      bodyFont: p.bodyFont ?? undefined,
      logoUrl: p.logoUrl ?? undefined,
      logoSquareUrl: p.logoSquareUrl ?? undefined,
      logoRectUrl: p.logoRectUrl ?? undefined,
      logoIconUrl: p.logoIconUrl ?? undefined,
      faviconUrl: p.faviconUrl ?? undefined,
      ogImageUrl: p.ogImageUrl ?? undefined,
      buttonStyle: p.buttonStyle as { primaryBg?: string; primaryText?: string } | null,
    },
    messaging,
  });
  return { report };
}

// ─── Registration helper ─────────────────────────────────────────────────────

export interface McpRegistration {
  tool(
    name: string,
    description: string,
    inputSchema: unknown,
    handler: (input: unknown) => Promise<unknown>,
  ): void;
}

/**
 * Wire the branding tools into an MCP server instance. Callers provide a
 * `getCtx` function that extracts the authenticated client id from the
 * request — the server layer decides how (API key, OAuth, cookie).
 */
export function registerBrandingTools(
  server: McpRegistration,
  getCtx: () => HandlerContext | Promise<HandlerContext>,
) {
  const wrap = <I, O>(fn: (ctx: HandlerContext, input: I) => Promise<O> | O) =>
    async (input: unknown): Promise<O> => {
      const ctx = await getCtx();
      return fn(ctx, input as I);
    };

  server.tool(
    'branding_list_profiles',
    brandingToolSchemas.branding_list_profiles.description,
    brandingToolSchemas.branding_list_profiles.inputSchema,
    wrap<Record<string, never>, unknown>(handleBrandingListProfiles),
  );
  server.tool(
    'branding_get_profile',
    brandingToolSchemas.branding_get_profile.description,
    brandingToolSchemas.branding_get_profile.inputSchema,
    wrap<{ profileId?: number }, unknown>(handleBrandingGetProfile),
  );
  server.tool(
    'branding_get_messaging',
    brandingToolSchemas.branding_get_messaging.description,
    brandingToolSchemas.branding_get_messaging.inputSchema,
    wrap<{ profileId?: number }, unknown>(handleBrandingGetMessaging),
  );
  server.tool(
    'branding_audit',
    brandingToolSchemas.branding_audit.description,
    brandingToolSchemas.branding_audit.inputSchema,
    wrap<{ profileId: number }, unknown>(handleBrandingAudit),
  );
  server.tool(
    'branding_check_contrast',
    brandingToolSchemas.branding_check_contrast.description,
    brandingToolSchemas.branding_check_contrast.inputSchema,
    wrap<{ foreground: string; background: string }, unknown>(
      (ctx, input) => Promise.resolve(handleBrandingCheckContrast(ctx, input)),
    ),
  );
}
