// GET /api/portal/plugins/scripts
//
// Returns the flat list of `(plugin, script)` pairs available to the active
// client — the union of entitled plugins (via the same `loadUserApps` path
// the sidebar uses) and the `scripts` array each plugin declares in its
// manifest. Powers the automation builder's "Run a plugin script" picker
// so users can schedule any registered script without hand-writing the
// `action: { tool: 'run_plugin_script', params: {...} }` JSON.
//
// Tenancy: results are scoped to the active client via `getPortalClient`.
// A user with no client (somehow) gets an empty list. The plugin
// entitlement re-check happens server-side inside `loadUserApps`.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { loadUserApps } from '@/lib/plugins/load-user-apps';
import { fetchAndCacheManifest } from '@/lib/plugins/manifest';
import { findActivePluginBySlug } from '@/lib/plugins/entitlement';
import type { ManifestScript } from '@/lib/plugins/manifest-schema';

export const dynamic = 'force-dynamic';

interface PluginScriptItem {
  pluginSlug: string;
  pluginName: string;
  pluginIcon: string;
  script: ManifestScript;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(String(session.user.id), 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: true, items: [] });
  }

  const apps = await loadUserApps(client.id);
  const items: PluginScriptItem[] = [];

  for (const app of apps) {
    // loadUserApps caches the manifest nav but doesn't expose the full
    // manifest — re-resolve it through findActivePluginBySlug +
    // fetchAndCacheManifest so we read `scripts`. Cheap because the
    // manifest fetch is itself cached (lib/plugins/manifest.ts).
    const fullApp = await findActivePluginBySlug(app.slug);
    if (!fullApp) continue;
    const manifestResult = await fetchAndCacheManifest(fullApp);
    if (!manifestResult.ok) continue;
    const scripts = manifestResult.manifest.scripts ?? [];
    for (const script of scripts) {
      items.push({
        pluginSlug: app.slug,
        pluginName: app.name,
        pluginIcon: app.icon,
        script,
      });
    }
  }

  return NextResponse.json({ success: true, items });
}
