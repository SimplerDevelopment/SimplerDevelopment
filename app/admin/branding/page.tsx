import { db } from '@/lib/db';
import { clientWebsites, siteBranding, clients } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';

export default async function AdminBrandingPage() {
  // Load all websites with their branding status
  const websites = await db
    .select({
      id: clientWebsites.id,
      name: clientWebsites.name,
      domain: clientWebsites.domain,
      active: clientWebsites.active,
      clientId: clientWebsites.clientId,
      clientName: clients.company,
      brandingId: siteBranding.id,
      primaryColor: siteBranding.primaryColor,
      accentColor: siteBranding.accentColor,
      logoUrl: siteBranding.logoUrl,
      headingFont: siteBranding.headingFont,
      bodyFont: siteBranding.bodyFont,
    })
    .from(clientWebsites)
    .leftJoin(siteBranding, eq(siteBranding.websiteId, clientWebsites.id))
    .leftJoin(clients, eq(clients.id, clientWebsites.clientId))
    .orderBy(desc(clientWebsites.updatedAt));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Branding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage brand identity across all client websites. These settings apply to CMS blocks, pitch decks, proposals, and public site rendering.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {websites.map((site) => {
            const hasBranding = !!site.brandingId;
            const primary = site.primaryColor || '#2563eb';
            const accent = site.accentColor || '#f59e0b';

            return (
              <div
                key={site.id}
                className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
              >
                {/* Color preview bar */}
                <div className="h-2 flex">
                  <div className="flex-1" style={{ backgroundColor: primary }} />
                  <div className="flex-1" style={{ backgroundColor: accent }} />
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{site.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {site.clientName || 'No client'}
                        {site.domain ? ` \u2014 ${site.domain}` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                        hasBranding
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}
                    >
                      {hasBranding ? 'Configured' : 'Default'}
                    </span>
                  </div>

                  {/* Quick preview */}
                  <div className="flex items-center gap-3">
                    {site.logoUrl ? (
                      <img
                        src={site.logoUrl}
                        alt={site.name}
                        className="w-8 h-8 object-contain rounded"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                        <span className="material-icons text-sm text-muted-foreground">image</span>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <div
                        className="w-6 h-6 rounded-full border border-border"
                        style={{ backgroundColor: primary }}
                        title={`Primary: ${primary}`}
                      />
                      <div
                        className="w-6 h-6 rounded-full border border-border"
                        style={{ backgroundColor: accent }}
                        title={`Accent: ${accent}`}
                      />
                    </div>
                    {(site.headingFont || site.bodyFont) && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {site.headingFont || site.bodyFont}
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/portal/websites/${site.id}/branding`}
                    className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
                  >
                    <span className="material-icons text-sm">palette</span>
                    Edit Branding
                  </Link>
                </div>
              </div>
            );
          })}

          {websites.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <span className="material-icons text-4xl mb-2 block">palette</span>
              No websites found. Create a website first to configure branding.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
