'use client';

import { useEffect, useState } from 'react';

interface TemplateEditorProps {
  siteId: string;
  typeId: string;
  typeName: string;
  typeSlug: string;
}

interface TemplateBody {
  blocks: unknown[];
  version?: string;
}

const STARTER_TEMPLATE = `{
  "blocks": [
    {
      "id": "tpl-eyebrow",
      "type": "text",
      "order": 0,
      "content": "Replace this header with anything (heading, image, hero, etc.). The post body renders where the post-content placeholder is."
    },
    {
      "id": "tpl-post-content",
      "type": "post-content",
      "order": 1
    },
    {
      "id": "tpl-cta",
      "type": "text",
      "order": 2,
      "content": "Add a CTA, related posts, or footer here — it will render on every post of this type."
    }
  ],
  "version": "1.0"
}`;

export function TemplateEditor({ siteId, typeId, typeName, typeSlug }: TemplateEditorProps) {
  const endpoint = `/api/portal/cms/websites/${siteId}/content-types/${typeId}/template`;
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(endpoint).then(r => r.json());
        if (cancelled) return;
        if (res.success) {
          const initial = res.data?.template ? JSON.stringify(res.data.template, null, 2) : '';
          setText(initial);
          setSavedText(initial);
        } else {
          setError(res.message || 'Failed to load template.');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [endpoint]);

  const dirty = text !== savedText;
  const isEmpty = !text.trim();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      let template: TemplateBody | null = null;
      if (!isEmpty) {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || !Array.isArray(parsed.blocks)) {
            setError('Template must be JSON with a `blocks` array.');
            setSaving(false);
            return;
          }
          template = { blocks: parsed.blocks, version: parsed.version || '1.0' };
        } catch (e) {
          setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
          setSaving(false);
          return;
        }
      }
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      }).then(r => r.json());
      if (res.success) {
        const out = res.data?.template ? JSON.stringify(res.data.template, null, 2) : '';
        setText(out);
        setSavedText(out);
        setSavedAt(new Date());
      } else {
        setError(res.message || 'Save failed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{typeName} — Template</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Wrapper rendered around every <code className="font-mono">{typeSlug}</code> post. Insert a block of
            type <code className="font-mono">post-content</code> where the post body should appear; if you omit it,
            the post body is appended after the wrapper.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {dirty ? 'Unsaved changes' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : isEmpty ? 'No template (post renders raw)' : ''}
          </span>
          {!savedText && (
            <button
              type="button"
              onClick={() => setText(STARTER_TEMPLATE)}
              className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
            >
              Insert starter
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <span className="material-icons text-base animate-spin">refresh</span>}
            <span className="material-icons text-base">save</span>
            Save
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>Template JSON — same shape as a post’s <code className="font-mono">content</code> field.</span>
          <span>Empty + Save = remove the template.</span>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
              <span className="material-icons animate-spin">refresh</span>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder={'// Empty = no template. Otherwise paste { "blocks": [...], "version": "1.0" }.'}
              className="w-full h-[60vh] resize-none rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3 whitespace-pre-wrap">
          {error}
        </div>
      )}
    </div>
  );
}
