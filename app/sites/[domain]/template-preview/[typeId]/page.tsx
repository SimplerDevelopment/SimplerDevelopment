import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { postTypes } from '@/lib/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { SiteBlockRenderer } from '@/components/blocks/render/SiteBlockRenderer';
import { getBrandingByWebsiteId } from '@/lib/branding';
import { auth } from '@/lib/auth';
import { verifyPreviewToken } from '@/lib/preview-token';

// The iframe target for the template editor. The route loads the type's saved
// template, then VisualEditorShell takes over via postMessage and feeds the
// iframe whatever block tree the parent is currently editing. We don't have to
// keep this page in sync — once the editor mounts, the parent owns the truth.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ domain: string; typeId: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}

export default async function TemplatePreviewPage({ params, searchParams }: PageProps) {
  const { domain, typeId } = await params;
  const { _edit, _token } = await searchParams;

  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  // Editor / preview gate — same pattern as the main site route.
  const isEditMode = _edit === 'true';
  let preview = false;
  if (isEditMode) {
    if (typeof _token === 'string' && verifyPreviewToken(site.id, _token)) {
      preview = true;
    } else {
      const session = await auth();
      preview = !!session?.user?.id;
    }
  }
  if (!preview) {
    // The template preview is not a public-facing URL.
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Sign in to preview a content-type template.</p>
      </div>
    );
  }

  // Load the type — site-specific row wins over a global built-in of the same id.
  const [type] = await db
    .select()
    .from(postTypes)
    .where(and(
      eq(postTypes.id, parseInt(typeId)),
      or(eq(postTypes.websiteId, site.id), isNull(postTypes.websiteId))
    ))
    .orderBy(sql`${postTypes.websiteId} DESC NULLS LAST`)
    .limit(1);
  if (!type) notFound();

  // Initial content: the type's saved template, or a starter that reminds the
  // author to drop in a post-content block. Once the editor connects, this
  // will be replaced by whatever's in the parent shell.
  const initialContent = type.template
    ? type.template
    : JSON.stringify({
        blocks: [
          {
            id: 'tpl-empty',
            type: 'post-content',
            order: 0,
          },
        ],
        version: '1.0',
      });

  const branding = await getBrandingByWebsiteId(site.id);

  return (
    <div>
      <SiteBlockRenderer
        content={initialContent}
        siteId={site.id}
        branding={branding}
        site={{ customCss: site.customCss, customJs: site.customJs }}
        type={{ customCss: type.customCss, customJs: type.customJs }}
      />
    </div>
  );
}
