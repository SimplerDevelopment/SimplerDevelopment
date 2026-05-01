import { CustomCodeForm } from '@/components/portal/CustomCodeForm';
import { db } from '@/lib/db';
import { postTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface PageProps {
  params: Promise<{ siteId: string; typeId: string }>;
}

export default async function ContentTypeCodePage({ params }: PageProps) {
  const { siteId, typeId } = await params;
  const [type] = await db
    .select({ name: postTypes.name, slug: postTypes.slug })
    .from(postTypes)
    .where(eq(postTypes.id, parseInt(typeId)))
    .limit(1);
  return (
    <CustomCodeForm
      endpoint={`/api/portal/cms/websites/${siteId}/content-types/${typeId}/code`}
      title={`${type?.name || 'Content type'} — Custom Code`}
      subtitle={
        type
          ? `Applies to every post of type "${type.slug}". Cascades after the site layer and before per-post code.`
          : 'Applies to every post of this content type.'
      }
    />
  );
}
