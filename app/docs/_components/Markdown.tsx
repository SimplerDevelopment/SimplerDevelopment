import React from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import { slugify } from '../_lib/nav';
import { CopyButton } from './CopyButton';

const HTTP_METHOD = /^(GET|POST|PUT|PATCH|DELETE)\s+(\S.*)$/;

/** Flatten React children to their text content (for heading ids + copy text). */
function nodeToString(node: React.ReactNode): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToString).join('');
  if (React.isValidElement(node)) return nodeToString((node.props as { children?: React.ReactNode }).children);
  return '';
}

function HeadingAnchor({ id }: { id: string }) {
  return (
    <a href={`#${id}`} className="docs-anchor" aria-label="Link to this section">
      #
    </a>
  );
}

/**
 * Render a markdown string into branded docs HTML.
 * @param docDir directory of the source file relative to docs/ — used to rewrite relative links.
 */
export function Markdown({ content, docDir }: { content: string; docDir: string }) {
  const components: Components = {
    h1: ({ children }) => {
      const id = slugify(nodeToString(children));
      return (
        <h1 id={id} className="docs-heading">
          {children}
        </h1>
      );
    },
    h2: ({ children }) => {
      const id = slugify(nodeToString(children));
      return (
        <h2 id={id} className="docs-heading">
          {children}
          <HeadingAnchor id={id} />
        </h2>
      );
    },
    h3: ({ children }) => {
      const text = nodeToString(children);
      const id = slugify(text);
      const m = HTTP_METHOD.exec(text);
      if (m) {
        return (
          <h3 id={id} className="docs-heading docs-endpoint">
            <span className="docs-method" data-method={m[1]}>
              {m[1]}
            </span>
            <code className="docs-endpoint-path">{m[2]}</code>
            <HeadingAnchor id={id} />
          </h3>
        );
      }
      return (
        <h3 id={id} className="docs-heading">
          {children}
          <HeadingAnchor id={id} />
        </h3>
      );
    },
    pre: ({ children }) => {
      const code = nodeToString(children).replace(/\n$/, '');
      return (
        <div className="docs-codeblock not-prose">
          <CopyButton text={code} />
          <pre>{children}</pre>
        </div>
      );
    },
    a: ({ href, children, ...rest }) => {
      const url = href ?? '';
      if (url.startsWith('#') || url.startsWith('mailto:')) {
        return (
          <a href={url} {...rest}>
            {children}
          </a>
        );
      }
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return (
          <a href={url} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
          </a>
        );
      }
      // Relative link inside the docs tree (with or without a .md extension).
      const internal = rewriteDocLink(url, docDir);
      return <Link href={internal}>{children}</Link>;
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

/** Resolve a relative markdown link to a real /docs/... route. */
function rewriteDocLink(href: string, docDir: string): string {
  if (href.startsWith('/')) return href; // already absolute (e.g. /portal/...)
  const [pathPart, hash = ''] = href.split('#');
  const stripped = pathPart
    .replace(/^\.\//, '')
    .replace(/\.md$/, '')
    .replace(/\/$/, '');
  const joined = docDir ? `${docDir}/${stripped}` : stripped;
  const resolved = normalizePosix(joined);
  // README / index collapse to the directory root.
  const segments = resolved.split('/').filter(Boolean);
  if (segments[segments.length - 1] === 'README' || segments[segments.length - 1] === 'index') {
    segments.pop();
  }
  const route = segments.length ? `/docs/${segments.join('/')}` : '/docs';
  return hash ? `${route}#${hash}` : route;
}

/** Minimal posix-path normalize (resolves ./ and ../) without importing node:path into a client-adjacent module. */
function normalizePosix(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}
