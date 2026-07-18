// Plugin manifest contract — the Zod schemas the portal uses to validate a
// remote plugin's self-description served at `<host_url>/sd-manifest.json`.
// See `.planning/plugin-registry-spec.md` § "Manifest contract" for the
// long-lived spec. These schemas are the load-bearing piece — they're what
// the portal applies before trusting any nav item or callback route a plugin
// declares.

import { z } from 'zod';

// One nav item the plugin contributes to the portal sidebar / cmd-k palette.
// `href` is plugin-local (starts with `/`); the portal rewrites it to
// `/portal/apps/<slug>/<href>` when rendering. `icon` is a Material icon name
// (no emojis per project convention).
export const ManifestNavItemSchema = z.object({
  label: z.string().min(1).max(64),
  href: z.string().regex(/^\//, 'must start with /'),
  icon: z.string().min(1).max(64),
  keywords: z.array(z.string()).optional(),
});

// A callback the plugin promises to call. `scope` is the scope key the portal
// must check on every request to this path (format: `ns:resource:action`,
// with an optional wildcard tail like `ns:resource:*`).
export const ManifestCallbackSchema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']),
  path: z.string().regex(/^\//, 'must start with /'),
  scope: z
    .string()
    .regex(
      /^[a-z0-9_-]+:[a-z0-9_-]+(:[a-z0-9_*-]+)?$/,
      'invalid scope format',
    ),
});

// One script ("process") the plugin exposes to SD's automation engine.
// The automation builder uses these to render the action picker; the
// `kind` field on `registered_app_runs` is the `id` of the script.
//
// `argsSchema` is intentionally a flat list of typed fields rather than a
// full JSON Schema — keeps the automation arg form trivial to render and
// avoids dragging a json-schema runtime into the manifest contract. Type
// coercion (number / boolean / string) happens client-side before the
// run row is enqueued.
export const ManifestScriptArgSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(['string', 'number', 'boolean']),
  required: z.boolean().optional(),
  description: z.string().max(500).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const ManifestScriptSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().min(1).max(1000),
  icon: z.string().min(1).max(64).optional(),
  argsSchema: z.array(ManifestScriptArgSchema).max(20).optional(),
});

// Top-level manifest. `id` MUST match `registered_apps.slug`. `requiredScopes`
// MUST be a subset of `registered_apps.default_scopes`. Both checks happen in
// `lib/plugins/manifest.ts` after schema validation.
export const ManifestSchema = z.object({
  id: z.string().min(1).max(64),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'must be SemVer'),
  nav: z.array(ManifestNavItemSchema).min(1).max(20),
  requiredScopes: z.array(z.string()).max(50),
  callbacks: z.array(ManifestCallbackSchema).max(50),
  // Optional — earlier manifests predate the scripts/automation pairing.
  // When absent the automation builder simply doesn't list this plugin.
  scripts: z.array(ManifestScriptSchema).max(50).optional(),
  publishedAt: z.string().datetime(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestNavItem = z.infer<typeof ManifestNavItemSchema>;
export type ManifestCallback = z.infer<typeof ManifestCallbackSchema>;
export type ManifestScript = z.infer<typeof ManifestScriptSchema>;
export type ManifestScriptArg = z.infer<typeof ManifestScriptArgSchema>;
