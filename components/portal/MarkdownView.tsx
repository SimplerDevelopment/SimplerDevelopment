'use client';

import { Children, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';

interface Props {
  children: string;
  className?: string;
  highlightMentions?: boolean;
}

function highlightMentionsIn(node: ReactNode): ReactNode {
  if (typeof node === 'string') {
    const parts = node.split(/(@\w+)/g);
    if (parts.length === 1) return node;
    return parts.map((p, i) =>
      p.startsWith('@')
        ? <strong key={i} className="text-primary font-medium">{p}</strong>
        : p,
    );
  }
  if (Array.isArray(node)) return node.map((c, i) => <span key={i}>{highlightMentionsIn(c)}</span>);
  if (isValidElement(node)) return node;
  return node;
}

function wrapChildren(children: ReactNode, highlight: boolean): ReactNode {
  if (!highlight) return children;
  return Children.map(children, c => highlightMentionsIn(c));
}

export default function MarkdownView({ children, className, highlightMentions = false }: Props) {
  const components: Components = {
    h1: ({ children }) => <h1 className="text-lg font-bold text-foreground mt-3 mb-2 first:mt-0">{wrapChildren(children, highlightMentions)}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold text-foreground mt-3 mb-1.5 first:mt-0">{wrapChildren(children, highlightMentions)}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-2.5 mb-1 first:mt-0">{wrapChildren(children, highlightMentions)}</h3>,
    h4: ({ children }) => <h4 className="text-sm font-semibold text-foreground mt-2 mb-1 first:mt-0">{wrapChildren(children, highlightMentions)}</h4>,
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{wrapChildren(children, highlightMentions)}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{wrapChildren(children, highlightMentions)}</strong>,
    em: ({ children }) => <em className="italic">{wrapChildren(children, highlightMentions)}</em>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{wrapChildren(children, highlightMentions)}</li>,
    code: ({ className: cn, children }) => {
      const isBlock = /language-/.test(cn ?? '');
      if (isBlock) {
        return <code className="block bg-muted/70 rounded-md p-3 text-xs font-mono overflow-x-auto">{children}</code>;
      }
      return <code className="bg-muted rounded px-1.5 py-0.5 text-xs font-mono">{children}</code>;
    },
    pre: ({ children }) => <pre className="bg-muted/70 rounded-md p-3 text-xs font-mono overflow-x-auto mb-2">{children}</pre>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-border pl-3 italic text-muted-foreground mb-2">{children}</blockquote>
    ),
    hr: () => <hr className="my-3 border-border" />,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-2">
        <table className="min-w-full text-xs border border-border">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border border-border px-2 py-1 bg-muted font-semibold text-left">{children}</th>,
    td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
  };

  return (
    <div className={className}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
