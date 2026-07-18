'use client';

import { useEffect, useState } from 'react';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'image', label: 'Image' },
  { value: 'user_select', label: 'User Select' },
  { value: 'repeater', label: 'Repeater' },
  { value: 'group', label: 'Field Group' },
];

interface ManagedField {
  id: number;
  postTypeId: number;
  parentId: number | null;
  name: string;
  slug: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  defaultValue: string | null;
  helpText: string | null;
  order: number;
}

interface CustomFieldsManagerProps {
  /** Where to GET / POST the field collection (e.g.
   *  /api/portal/cms/websites/<siteId>/content-types/<typeId>/fields). */
  collectionEndpoint: string;
  /** Where to PUT / DELETE a single field (joined with /<id>). */
  itemEndpoint: string;
  /** Optional callback after a successful save/edit/delete. */
  onChanged?: () => void;
}

// Reusable field-management UI. Lifted from the post-editor's
// ManageCustomFieldsModal so the in-modal flow and the dedicated CPT admin
// page share one implementation. Pure UI — caller picks the endpoint.
export function CustomFieldsManager({ collectionEndpoint, itemEndpoint, onChanged }: CustomFieldsManagerProps) {
  const [fields, setFields] = useState<ManagedField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingField, setEditingField] = useState<ManagedField | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    fieldType: 'text',
    optionsText: '',
    required: false,
    defaultValue: '',
    helpText: '',
    order: 0,
    parentId: null as number | null,
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const topLevelFields = fields.filter((f) => !f.parentId);
  const childFieldsOf = (parentId: number) => fields.filter((f) => f.parentId === parentId);

  const toggleGroup = (id: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingField(null);
    setError('');
    setFormData({
      name: '',
      slug: '',
      fieldType: 'text',
      optionsText: '',
      required: false,
      defaultValue: '',
      helpText: '',
      order: fields.length,
      parentId: null,
    });
  };

  const startAddSubField = (parentId: number) => {
    resetForm();
    setFormData((prev) => ({
      ...prev,
      parentId,
      order: childFieldsOf(parentId).length,
    }));
    setShowForm(true);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(collectionEndpoint).then(r => r.json());
        if (cancelled) return;
        if (res.success) setFields(res.data);
        else setError(res.message || 'Failed to load custom fields.');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [collectionEndpoint]);

  const refetch = async () => {
    const res = await fetch(collectionEndpoint).then(r => r.json());
    if (res.success) setFields(res.data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const url = editingField ? `${itemEndpoint}/${editingField.id}` : collectionEndpoint;
    const method = editingField ? 'PUT' : 'POST';
    const options =
      formData.fieldType === 'select' && formData.optionsText
        ? formData.optionsText.split('\n').map((o) => o.trim()).filter(Boolean)
        : null;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: formData.parentId || null,
          name: formData.name,
          slug: formData.slug,
          fieldType: formData.fieldType,
          options,
          required: formData.required,
          defaultValue: formData.defaultValue || null,
          helpText: formData.helpText || null,
          order: formData.order,
        }),
      });
      if (res.ok) {
        await refetch();
        onChanged?.();
        resetForm();
      } else {
        const data = await res.json().catch(() => ({ message: 'Failed to save' }));
        setError(data.message || data.error || 'Failed to save custom field');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (field: ManagedField) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      slug: field.slug,
      fieldType: field.fieldType,
      optionsText: field.options ? field.options.join('\n') : '',
      required: field.required,
      defaultValue: field.defaultValue || '',
      helpText: field.helpText || '',
      order: field.order,
      parentId: field.parentId,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this custom field? All saved values for it will be lost.')) return;
    const res = await fetch(`${itemEndpoint}/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await refetch();
      onChanged?.();
    }
  };

  return (
    <div className="space-y-4">
      {/* Add / Edit form */}
      {showForm ? (
        <form onSubmit={handleSubmit} className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold text-foreground">
              {editingField ? 'Edit Field' : formData.parentId ? 'New Sub-field' : 'New Field'}
            </h4>
            <button type="button" onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
              <input
                required
                value={formData.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    name,
                    ...(!editingField ? { slug: generateSlug(name) } : {}),
                  }));
                }}
                placeholder="e.g. Author Name"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Slug *</label>
              <input
                required
                value={formData.slug}
                onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="author_name"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Field Type *</label>
              <select
                value={formData.fieldType}
                onChange={(e) => setFormData((prev) => ({ ...prev, fieldType: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
              >
                {FIELD_TYPES
                  .filter((ft) => !formData.parentId || (ft.value !== 'repeater' && ft.value !== 'group'))
                  .map((ft) => (
                    <option key={ft.value} value={ft.value}>{ft.label}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Order</label>
              <input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData((prev) => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          {formData.fieldType === 'select' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Options (one per line)</label>
              <textarea
                value={formData.optionsText}
                onChange={(e) => setFormData((prev) => ({ ...prev, optionsText: e.target.value }))}
                rows={3}
                placeholder={'Option 1\nOption 2\nOption 3'}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Default Value</label>
              <input
                value={formData.defaultValue}
                onChange={(e) => setFormData((prev) => ({ ...prev, defaultValue: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Help Text</label>
              <input
                value={formData.helpText}
                onChange={(e) => setFormData((prev) => ({ ...prev, helpText: e.target.value }))}
                placeholder="Description for editors"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.required}
                onChange={(e) => setFormData((prev) => ({ ...prev, required: e.target.checked }))}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-foreground">Required</span>
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : editingField ? 'Update Field' : 'Add Field'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
        >
          <span className="material-icons text-base">add</span>
          Add Field
        </button>
      )}

      {/* Loading / empty / list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="material-icons animate-spin text-muted-foreground">progress_activity</span>
        </div>
      ) : topLevelFields.length === 0 && !showForm ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <span className="material-icons text-3xl text-muted-foreground mb-2 block">input</span>
          <p className="text-sm text-muted-foreground">No fields defined for this content type yet.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {topLevelFields.map((field) => {
            const isContainer = field.fieldType === 'repeater' || field.fieldType === 'group';
            const children = isContainer ? childFieldsOf(field.id) : [];
            const isExpanded = expandedGroups.has(field.id);
            return (
              <div key={field.id}>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-muted/50 group">
                  <div className="flex items-center gap-3 min-w-0">
                    {isContainer ? (
                      <button
                        type="button"
                        onClick={() => toggleGroup(field.id)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <span className="material-icons text-base">
                          {isExpanded ? 'expand_more' : 'chevron_right'}
                        </span>
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0">{field.order}</span>
                    )}
                    <span className="material-icons text-sm text-muted-foreground shrink-0">
                      {field.fieldType === 'repeater' ? 'repeat' : field.fieldType === 'group' ? 'folder' : 'input'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{field.name}</span>
                        {field.required && <span className="text-red-500 text-xs">*</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-muted-foreground">{field.slug}</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary/10 text-primary">{field.fieldType}</span>
                        {isContainer && (
                          <span className="text-[10px] text-muted-foreground">{children.length} sub-field{children.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {isContainer && (
                      <button
                        type="button"
                        onClick={() => { toggleGroup(field.id); startAddSubField(field.id); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                        title="Add sub-field"
                      >
                        <span className="material-icons text-base">add</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleEdit(field)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <span className="material-icons text-base">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(field.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <span className="material-icons text-base">delete</span>
                    </button>
                  </div>
                </div>
                {isContainer && isExpanded && children.length > 0 && (
                  <div className="ml-8 mt-1 space-y-1 border-l-2 border-border pl-3">
                    {children.map((child) => (
                      <div
                        key={child.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 group/child"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0">{child.order}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">{child.name}</span>
                              {child.required && <span className="text-red-500 text-xs">*</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-mono text-muted-foreground">{child.slug}</span>
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary/10 text-primary">{child.fieldType}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/child:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEdit(child)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <span className="material-icons text-base">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(child.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <span className="material-icons text-base">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
