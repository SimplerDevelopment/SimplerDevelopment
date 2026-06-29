'use client';

import { useState } from 'react';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';
import type { ApprovalEntityPreview } from './ApprovalReviewer';

/**
 * Faithful post preview for the approval reviewer. Renders the post through the
 * SAME live-site iframe the visual editor's preview mode uses (?_preview=true),
 * so a reviewer sees exactly what the editor shows — with a desktop/mobile
 * viewport toggle. Falls back to direct BlockRenderer output when the site has
 * no resolvable domain (so iframeSrc is null).
 */
export function PostPreview({
  preview,
}: {
  preview: Extract<ApprovalEntityPreview, { kind: 'post' }>;
}) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
      {/* Metadata header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500">
          Slug <code className="text-gray-700">{preview.slug}</code> ·{' '}
          {preview.published ? 'Currently published' : 'Currently a draft'}
          {preview.customJs && (
            <span className="ml-2 text-amber-700">
              · Page has custom JS (not executed in preview)
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {preview.iframeSrc ? (
        <div className="bg-gray-100 p-4 rounded-b-xl">
          {/* Viewport toggle toolbar */}
          <div className="flex items-center gap-1 mb-3">
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`text-xs px-3 py-1 border rounded-l ${
                viewport === 'desktop'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`text-xs px-3 py-1 border rounded-r -ml-px ${
                viewport === 'mobile'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Mobile
            </button>
          </div>

          {/* Device frame */}
          <div
            className="border border-gray-200 rounded-lg overflow-hidden bg-white mx-auto transition-all"
            style={{ width: viewport === 'mobile' ? '390px' : '100%' }}
          >
            <iframe
              src={preview.iframeSrc}
              title="Page preview"
              className="w-full"
              style={{ border: 0, height: '75vh' }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </div>
      ) : (
        <>
          {/* Fallback: inject customCss and render blocks directly */}
          {preview.customCss && (
            <style dangerouslySetInnerHTML={{ __html: preview.customCss }} />
          )}
          <div className="p-2 sm:p-4">
            <BlockRenderer content={preview.content} siteId={preview.siteId ?? undefined} />
          </div>
        </>
      )}
    </div>
  );
}
