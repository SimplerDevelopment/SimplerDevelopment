'use client';

import { useState, useEffect, useCallback } from 'react';
import { Block } from '@/types/blocks';
import { Column } from '@/types/blocks/layout';

interface BlockTemplate {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  scope: string;
  blocks: Block[];
  tags: string[];
  version: number;
}

interface TemplateLibraryProps {
  onInsert: (blocks: Block[]) => void;
  onClose: () => void;
  /** Override the default `/api/block-templates` listing target. Portal callers
   *  pass the tenant-scoped endpoint so they only see their own + global
   *  templates. */
  endpoint?: string;
}

const SCOPE_COLORS: Record<string, string> = {
  block: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  section: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  global: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export function TemplateLibrary({ onInsert, onClose, endpoint = '/api/block-templates' }: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<BlockTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('all');

  const fetchTemplates = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (scopeFilter !== 'all') params.set('scope', scopeFilter);

    try {
      const response = await fetch(`${endpoint}?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch {
      // Silent fail - empty state will show
    }
    setLoading(false);
  }, [search, scopeFilter, endpoint]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchTemplates());
  }, [fetchTemplates]);

  const handleInsert = (template: BlockTemplate) => {
    // Generate new IDs for all blocks so they're unique in the post
    const blocksWithNewIds = template.blocks.map((block, index) => ({
      ...block,
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: index,
      // Recursively generate IDs for nested blocks
      ...('columns' in block && block.columns
        ? {
            columns: (block.columns as Column[]).map((col) => ({
              ...col,
              id: `col-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              blocks: col.blocks?.map((b) => ({
                ...b,
                id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              })) ?? [],
            })),
          }
        : {}),
      ...('tabs' in block && block.tabs
        ? {
            tabs: (block.tabs as Array<{ id: string; label: string; blocks: Block[] }>).map((tab) => ({
              ...tab,
              id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              blocks: tab.blocks?.map((b) => ({
                ...b,
                id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              })) ?? [],
            })),
          }
        : {}),
    })) as Block[];

    onInsert(blocksWithNewIds);
    onClose();
  };

  const getBlockTypeLabel = (block: Block) => {
    const type = block.type || 'unknown';
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ');
  };

  // Group templates by category
  const grouped = templates.reduce<Record<string, BlockTemplate[]>>((acc, t) => {
    const cat = t.category || 'uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-border rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Insert from Template</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search and filters */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            <div className="flex gap-1">
              {['all', 'block', 'section', 'global'].map((scope) => (
                <button
                  key={scope}
                  onClick={() => setScopeFilter(scope)}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    scopeFilter === scope
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {scope === 'all' ? 'All' : scope.charAt(0).toUpperCase() + scope.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Template list */}
        <div className="overflow-y-auto max-h-[calc(80vh-180px)] p-6">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto text-muted-foreground mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="text-lg font-semibold text-foreground mb-1">No templates found</h3>
              <p className="text-sm text-muted-foreground">
                {search
                  ? 'Try a different search term'
                  : 'Save blocks as templates using the toolbar menu'}
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, categoryTemplates]) => (
              <div key={category} className="mb-6 last:mb-0">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {category}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {categoryTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleInsert(template)}
                      className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left group bg-white dark:bg-gray-900"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-medium text-foreground group-hover:text-primary">
                          {template.name}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SCOPE_COLORS[template.scope] || ''}`}>
                          {template.scope}
                        </span>
                      </div>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                          {template.description}
                        </p>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {template.blocks.length === 1
                          ? getBlockTypeLabel(template.blocks[0])
                          : `${template.blocks.length} blocks`}
                        {template.scope === 'global' && (
                          <span className="ml-2 text-amber-600 dark:text-amber-400">
                            (synced)
                          </span>
                        )}
                      </div>
                      {template.tags && template.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {template.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-1 py-0.5 bg-muted rounded text-[10px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
