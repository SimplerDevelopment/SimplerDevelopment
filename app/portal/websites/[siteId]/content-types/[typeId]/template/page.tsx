import { db } from '@/lib/db';
import { postTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { TemplateEditor } from '@/components/portal/TemplateEditor';

interface PageProps {
  params: Promise<{ siteId: string; typeId: string }>;
}

export default async function ContentTypeTemplatePage({ params }: PageProps) {
  const { siteId, typeId } = await params;
  const [type] = await db
    .select({ id: postTypes.id, name: postTypes.name, slug: postTypes.slug })
    .from(postTypes)
    .where(eq(postTypes.id, parseInt(typeId)))
    .limit(1);
  return (
    <TemplateEditor
      siteId={siteId}
      typeId={typeId}
      typeName={type?.name || 'Content type'}
      typeSlug={type?.slug || ''}
    />
  );
}
