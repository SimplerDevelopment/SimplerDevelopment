'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { SurveyFormInline } from '@/components/blocks/render/SurveyFormInline';

export default function PublicSurveyPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === '1';
  const hideTitle = searchParams.get('hideTitle') === '1';
  const sourceParam = searchParams.get('source') || 'link';
  const sourceIdParam = searchParams.get('sid') || '';

  const bgClass = isEmbed ? 'bg-transparent' : 'min-h-screen bg-gray-50 dark:bg-gray-950';

  return (
    <div className={bgClass}>
      <SurveyFormInline
        slug={slug}
        showPageTitle={!hideTitle}
        source={sourceParam}
        sourceId={sourceIdParam}
      />
      {!isEmbed && (
        <p className="text-center text-xs text-gray-400 mt-6 pb-6">Powered by SimplerDevelopment</p>
      )}
    </div>
  );
}
