import { CustomCodeForm } from '@/components/portal/CustomCodeForm';

interface PageProps {
  params: Promise<{ siteId: string }>;
}

export default async function SiteCodePage({ params }: PageProps) {
  const { siteId } = await params;
  return (
    <CustomCodeForm
      endpoint={`/api/portal/cms/websites/${siteId}/code`}
      title="Site Custom Code"
      subtitle="Applies to every page on this website. Cascades before per-content-type and per-page custom code."
    />
  );
}
