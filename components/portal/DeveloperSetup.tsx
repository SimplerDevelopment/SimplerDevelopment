'use client';

import { useState } from 'react';

interface DeveloperSetupProps {
  siteId: number;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title="Copy to clipboard"
    >
      <span className="material-icons text-sm">{copied ? 'check' : 'content_copy'}</span>
    </button>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="relative">
      <pre className="bg-muted/50 border rounded-lg p-4 pr-12 overflow-x-auto text-sm font-mono">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

export default function DeveloperSetup({ siteId }: DeveloperSetupProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          <span className="material-icons text-primary">code</span>
          <div>
            <h3 className="font-semibold text-foreground">Developer Setup</h3>
            <p className="text-sm text-muted-foreground">
              Install the CMS rendering package and set up your local development environment.
            </p>
          </div>
        </div>
        <span className={`material-icons text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-5 border-t pt-4">
          {/* Step 1: Install */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-xs font-bold">1</span>
              Install the package
            </h4>
            <CodeBlock code="npm install @simplerdevelopment/cms-blocks" />
          </div>

          {/* Step 2: Environment Variables */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-xs font-bold">2</span>
              Set environment variables
            </h4>
            <CodeBlock
              code={`# .env.local
CMS_API_URL=https://simplerdevelopment.com
SITE_ID=${siteId}`}
            />
          </div>

          {/* Step 3: Set up CMS client */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-xs font-bold">3</span>
              Create the CMS client
            </h4>
            <CodeBlock
              code={`// lib/cms.ts
import { createCmsClient } from '@simplerdevelopment/cms-blocks';

const cms = createCmsClient(
  process.env.CMS_API_URL || 'https://simplerdevelopment.com',
  process.env.SITE_ID || ''
);

export const getPosts = cms.getPosts;
export const getPost = cms.getPost;
export const getCategories = cms.getCategories;
export const getTags = cms.getTags;
export const getMedia = cms.getMedia;`}
            />
          </div>

          {/* Step 4: Render content */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-xs font-bold">4</span>
              Render content with BlockRenderer
            </h4>
            <CodeBlock
              code={`// app/[slug]/page.tsx
import { BlockRenderer, EditorModeProvider } from '@simplerdevelopment/cms-blocks';
import { getPost } from '@/lib/cms';

export default async function Page({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return <BlockRenderer content={post.content} />;
}

// app/layout.tsx - wrap with EditorModeProvider for visual editing
import { EditorModeProvider } from '@simplerdevelopment/cms-blocks';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <EditorModeProvider>{children}</EditorModeProvider>
      </body>
    </html>
  );
}`}
            />
          </div>

          {/* Step 5: Tailwind config */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-xs font-bold">5</span>
              Configure Tailwind CSS
            </h4>
            <p className="text-sm text-muted-foreground mb-2">
              Add the package to your Tailwind content sources so block styles are included:
            </p>
            <CodeBlock
              code={`/* globals.css (Tailwind v4) */
@import "tailwindcss";
@source "./node_modules/@simplerdevelopment/cms-blocks/dist/**/*.{js,mjs}";`}
            />
          </div>

          {/* Custom blocks note */}
          <div className="bg-muted/30 border rounded-lg p-4">
            <div className="flex gap-3">
              <span className="material-icons text-primary mt-0.5">extension</span>
              <div className="text-sm">
                <p className="font-semibold text-foreground mb-1">Custom Blocks</p>
                <p className="text-muted-foreground">
                  You can register custom block components using <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">registerCustomBlocks()</code> from the package.
                  Custom blocks appear in the visual editor alongside built-in blocks.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
