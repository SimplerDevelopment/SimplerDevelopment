/**
 * MCP tool schemas for branding — DB-free so they're safe to import
 * from any context (tests, docs generators, client code).
 */

export const brandingToolSchemas = {
  branding_list_profiles: {
    description: 'List branding profiles for the authenticated client.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  branding_get_profile: {
    description: 'Get a full branding profile (colors, fonts, logos, button style) by id. Omit profileId to use the default profile.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'number', description: 'Branding profile id. Optional — defaults to the default profile.' },
      },
      additionalProperties: false,
    },
  },
  branding_get_messaging: {
    description: 'Get brand messaging (tagline, value prop, elevator pitch, voice, differentiators) for a profile.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  branding_audit: {
    description: 'Run the branding consistency audit on a profile. Returns WCAG contrast issues, missing-field warnings, and structural problems.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'number' },
      },
      required: ['profileId'],
      additionalProperties: false,
    },
  },
  branding_check_contrast: {
    description: 'Compute WCAG contrast ratio for two CSS colors. Returns ratio + AA/AAA pass/fail.',
    inputSchema: {
      type: 'object',
      properties: {
        foreground: { type: 'string', description: 'Foreground color (hex, rgb, rgba).' },
        background: { type: 'string', description: 'Background color (hex, rgb, rgba).' },
      },
      required: ['foreground', 'background'],
      additionalProperties: false,
    },
  },
} as const;

export type BrandingToolName = keyof typeof brandingToolSchemas;

export interface HandlerContext {
  clientId: number;
}

/**
 * Pure contrast-check handler — no DB needed. Used both by the MCP
 * registration and exported directly for programmatic callers.
 */
import { analyzeContrast } from './contrast';

export function handleBrandingCheckContrast(
  _ctx: HandlerContext,
  input: { foreground: string; background: string },
) {
  const result = analyzeContrast(input.foreground, input.background);
  return {
    ratio: result.ratio,
    normalText: result.normalText,
    largeText: result.largeText,
    passesAA: result.passesAA,
    passesAAA: result.passesAAA,
  };
}
