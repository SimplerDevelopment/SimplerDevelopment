'use client';

// ContentPanel: dispatcher for related block types' settings panels.
import type { Block, TextBlock, HeadingBlock, QuoteBlock, CodeBlock, HtmlRenderBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';

interface PanelProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function ContentPanel({ block, onChange, currentViewport }: PanelProps) {
  switch (block.type) {
    case 'text':
      return <TextBlockSettings block={block as TextBlock} onChange={onChange as (u: Partial<TextBlock>) => void} currentViewport={currentViewport} />;
    case 'heading':
      return <HeadingBlockSettings block={block as HeadingBlock} onChange={onChange as (u: Partial<HeadingBlock>) => void} currentViewport={currentViewport} />;
    case 'quote':
      return <QuoteBlockSettings block={block as QuoteBlock} onChange={onChange as (u: Partial<QuoteBlock>) => void} currentViewport={currentViewport} />;
    case 'code':
      return <CodeBlockSettings block={block as CodeBlock} onChange={onChange as (u: Partial<CodeBlock>) => void} currentViewport={currentViewport} />;
    case 'html-render':
      return <HtmlRenderBlockSettings block={block as HtmlRenderBlock} onChange={onChange as (u: Partial<HtmlRenderBlock>) => void} />;
    default:
      return null;
  }
}

function TextBlockSettings({ block, onChange, currentViewport }: { block: TextBlock; onChange: (updates: Partial<TextBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Text Size</label>
        <select
          value={block.size || 'base'}
          onChange={(e) => onChange({ size: e.target.value as TextBlock['size'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Small</option>
          <option value="base">Base</option>
          <option value="lg">Large</option>
          <option value="xl">Extra Large</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
        <div className="flex gap-2">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => onChange({ alignment: align })}
              className={`flex-1 px-3 py-2 text-sm rounded ${
                (block.alignment || 'left') === align
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-foreground hover:bg-accent'
              }`}
            >
              {align === 'left' && <><span className="material-icons text-base align-middle">format_align_left</span>{' '}Left</>}
              {align === 'center' && <><span className="material-icons text-base align-middle">format_align_center</span>{' '}Center</>}
              {align === 'right' && <><span className="material-icons text-base align-middle">format_align_right</span>{' '}Right</>}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

function HeadingBlockSettings({ block, onChange, currentViewport }: { block: HeadingBlock; onChange: (updates: Partial<HeadingBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Heading Level</label>
        <select
          value={block.level}
          onChange={(e) => onChange({ level: parseInt(e.target.value) as HeadingBlock['level'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="1">H1</option>
          <option value="2">H2</option>
          <option value="3">H3</option>
          <option value="4">H4</option>
          <option value="5">H5</option>
          <option value="6">H6</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
        <div className="flex gap-2">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => onChange({ alignment: align })}
              className={`flex-1 px-3 py-2 text-sm rounded ${
                (block.alignment || 'left') === align
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-foreground hover:bg-accent'
              }`}
            >
              {align === 'left' && <span className="material-icons text-base">format_align_left</span>}
              {align === 'center' && <span className="material-icons text-base">format_align_center</span>}
              {align === 'right' && <span className="material-icons text-base">format_align_right</span>}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

function QuoteBlockSettings({ block, onChange, currentViewport }: { block: QuoteBlock; onChange: (updates: Partial<QuoteBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Author</label>
        <input
          type="text"
          value={block.author || ''}
          onChange={(e) => onChange({ author: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Author name..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Citation</label>
        <input
          type="text"
          value={block.citation || ''}
          onChange={(e) => onChange({ citation: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Source or citation..."
        />
      </div>

    </div>
  );
}

function CodeBlockSettings({ block, onChange, currentViewport }: { block: CodeBlock; onChange: (updates: Partial<CodeBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Language</label>
        <select
          value={block.language || 'javascript'}
          onChange={(e) => onChange({ language: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="json">JSON</option>
          <option value="bash">Bash</option>
        </select>
      </div>
    </div>
  );
}

function HtmlRenderBlockSettings({ block, onChange }: { block: HtmlRenderBlock; onChange: (updates: Partial<HtmlRenderBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">HTML Markup</label>
        <textarea
          value={block.html || ''}
          onChange={(e) => onChange({ html: e.target.value })}
          rows={18}
          spellCheck={false}
          className="w-full text-xs font-mono rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="<section>...</section>"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Rendered directly into the page DOM. <code>&lt;script&gt;</code> tags execute on mount;
          page-level styles &amp; JS go in the Custom CSS &amp; JavaScript modal.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Width</label>
        <select
          value={block.width || 'full'}
          onChange={(e) => onChange({ width: e.target.value as 'full' | 'contained' })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="full">Full width</option>
          <option value="contained">Contained (centered)</option>
        </select>
      </div>
    </div>
  );
}

