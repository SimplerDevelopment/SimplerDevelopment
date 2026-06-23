// Custom-fields section: renders post-type field defs (groups + repeaters) + manage-fields modal.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import type { CustomFieldDef, ManagedField } from '../_lib/types';
import { generateCustomFieldSlug } from '../_lib/validation';

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

interface CustomFieldsSectionProps {
  customFieldDefs: CustomFieldDef[];
  customFieldValues: Record<number, string>;
  updateCustomFieldValue: (fieldId: number, value: string) => void;
  siteId: number;
  postType: string;
  showManageFieldsModal: boolean;
  setShowManageFieldsModal: (v: boolean) => void;
  setCustomFieldsLoaded: (v: boolean) => void;
}

export function CustomFieldsSection({
  customFieldDefs,
  customFieldValues,
  updateCustomFieldValue,
  siteId,
  postType,
  showManageFieldsModal,
  setShowManageFieldsModal,
  setCustomFieldsLoaded,
}: CustomFieldsSectionProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [repeaterRows, setRepeaterRows] = useState<Record<number, Array<Record<string, string>>>>({});
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const topLevelDefs = customFieldDefs.filter((f) => !f.parentId);
  const childDefsOf = useCallback(
    (parentId: number) => customFieldDefs.filter((f) => f.parentId === parentId),
    [customFieldDefs]
  );

  // Parse repeater JSON values on load
  useEffect(() => {
    const repeaters = customFieldDefs.filter((f) => f.fieldType === 'repeater' && !f.parentId);
    const parsed: Record<number, Array<Record<string, string>>> = {};
    for (const r of repeaters) {
      const raw = customFieldValues[r.id];
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            parsed[r.id] = arr;
            continue;
          }
        } catch { /* ignore */ }
      }
      parsed[r.id] = [];
    }
    setRepeaterRows(parsed);
  }, [customFieldDefs, customFieldValues]);

  const toggleGroup = (id: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateRepeaterRow = (repeaterId: number, rowIndex: number, slug: string, value: string) => {
    setRepeaterRows((prev) => {
      const rows = [...(prev[repeaterId] || [])];
      rows[rowIndex] = { ...rows[rowIndex], [slug]: value };
      const next = { ...prev, [repeaterId]: rows };
      // Debounced save
      if (debounceTimers.current[repeaterId]) clearTimeout(debounceTimers.current[repeaterId]);
      debounceTimers.current[repeaterId] = setTimeout(() => {
        updateCustomFieldValue(repeaterId, JSON.stringify(next[repeaterId]));
      }, 300);
      return next;
    });
  };

  const addRepeaterRow = (repeaterId: number) => {
    setRepeaterRows((prev) => {
      const rows = [...(prev[repeaterId] || []), {}];
      const next = { ...prev, [repeaterId]: rows };
      updateCustomFieldValue(repeaterId, JSON.stringify(rows));
      return next;
    });
  };

  const removeRepeaterRow = (repeaterId: number, rowIndex: number) => {
    setRepeaterRows((prev) => {
      const rows = (prev[repeaterId] || []).filter((_, i) => i !== rowIndex);
      const next = { ...prev, [repeaterId]: rows };
      updateCustomFieldValue(repeaterId, JSON.stringify(rows));
      return next;
    });
  };

  const renderFieldInput = (field: CustomFieldDef, value: string, onChange: (val: string) => void) => {
    const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary';
    switch (field.fieldType) {
      case 'textarea':
        return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.defaultValue || ''} className={`${inputClass} resize-none`} />;
      case 'select':
        return (
          <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
            <option value="">Select...</option>
            {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(String(e.target.checked))} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm text-foreground">{field.helpText || field.name}</span>
          </label>
        );
      case 'number':
        return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.defaultValue || ''} className={inputClass} />;
      case 'date':
        return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
      case 'image':
        return <MediaPicker value={value} onChange={onChange} label="" apiEndpoint={`/api/portal/cms/websites/${siteId}/media`} />;
      default:
        return <input type={field.fieldType === 'url' ? 'url' : field.fieldType === 'email' ? 'email' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.defaultValue || ''} className={inputClass} />;
    }
  };

  const renderField = (field: CustomFieldDef) => {
    // Skip sub-fields at top level (they render inside their parent)
    if (field.parentId) return null;

    if (field.fieldType === 'group') {
      const children = childDefsOf(field.id);
      const isCollapsed = collapsedGroups.has(field.id);
      return (
        <div key={field.id} className="border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleGroup(field.id)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/50 hover:bg-muted text-left"
          >
            <span className="material-icons text-base text-muted-foreground">
              {isCollapsed ? 'chevron_right' : 'expand_more'}
            </span>
            <span className="material-icons text-sm text-muted-foreground">folder</span>
            <span className="text-sm font-medium text-foreground">{field.name}</span>
            <span className="text-xs text-muted-foreground ml-auto">{children.length} field{children.length !== 1 ? 's' : ''}</span>
          </button>
          {!isCollapsed && (
            <div className="p-3 space-y-4 border-t border-border">
              {children.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sub-fields in this group yet.</p>
              ) : (
                children.map((child) => (
                  <div key={child.id}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {child.name}
                      {child.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {renderFieldInput(child, customFieldValues[child.id] || '', (val) => updateCustomFieldValue(child.id, val))}
                    {child.helpText && child.fieldType !== 'checkbox' && (
                      <p className="text-xs text-muted-foreground mt-1">{child.helpText}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      );
    }

    if (field.fieldType === 'repeater') {
      const subFields = childDefsOf(field.id);
      const rows = repeaterRows[field.id] || [];
      const isCollapsed = collapsedGroups.has(field.id);
      return (
        <div key={field.id} className="border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleGroup(field.id)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/50 hover:bg-muted text-left"
          >
            <span className="material-icons text-base text-muted-foreground">
              {isCollapsed ? 'chevron_right' : 'expand_more'}
            </span>
            <span className="material-icons text-sm text-muted-foreground">repeat</span>
            <span className="text-sm font-medium text-foreground">{field.name}</span>
            <span className="text-xs text-muted-foreground ml-auto">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
          </button>
          {!isCollapsed && (
            <div className="p-3 space-y-3 border-t border-border">
              {subFields.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sub-fields defined for this repeater yet.</p>
              ) : (
                <>
                  {rows.map((row, rowIdx) => (
                    <div key={rowIdx} className="border border-border rounded-lg p-3 bg-background space-y-3 relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-muted-foreground">Row {rowIdx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeRepeaterRow(field.id, rowIdx)}
                          className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title="Remove row"
                        >
                          <span className="material-icons text-sm">delete_outline</span>
                        </button>
                      </div>
                      {subFields.map((sf) => (
                        <div key={sf.id}>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            {sf.name}
                            {sf.required && <span className="text-red-500 ml-0.5">*</span>}
                          </label>
                          {renderFieldInput(sf, row[sf.slug] || '', (val) => updateRepeaterRow(field.id, rowIdx, sf.slug, val))}
                          {sf.helpText && sf.fieldType !== 'checkbox' && (
                            <p className="text-xs text-muted-foreground mt-1">{sf.helpText}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addRepeaterRow(field.id)}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 w-full justify-center py-2 border border-dashed border-border rounded-lg hover:border-primary/50"
                  >
                    <span className="material-icons text-base">add_circle_outline</span>
                    Add Row
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    // Regular field
    return (
      <div key={field.id}>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          {field.name}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {renderFieldInput(field, customFieldValues[field.id] || '', (val) => updateCustomFieldValue(field.id, val))}
        {field.helpText && field.fieldType !== 'checkbox' && (
          <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setShowManageFieldsModal(true)}
        className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
      >
        <span className="material-icons text-base">settings</span>
        Manage Fields
      </button>

      {showManageFieldsModal && (
        <ManageCustomFieldsModal
          postTypeSlug={postType}
          onClose={() => setShowManageFieldsModal(false)}
          onFieldsChanged={() => setCustomFieldsLoaded(false)}
        />
      )}

      {topLevelDefs.length === 0 ? (
        <div className="text-center py-8">
          <span className="material-icons text-3xl text-muted-foreground mb-2 block">input</span>
          <p className="text-sm text-muted-foreground">No custom fields defined yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Click &quot;Manage Fields&quot; above to add fields for this post type.</p>
        </div>
      ) : (
        topLevelDefs.map((field) => renderField(field))
      )}
    </div>
  );
}

/** Modal for adding/editing/deleting custom-field defs scoped to a post type. */
function ManageCustomFieldsModal({
  postTypeSlug,
  onClose,
  onFieldsChanged,
}: {
  postTypeSlug: string;
  onClose: () => void;
  onFieldsChanged: () => void;
}) {
  const [postTypeId, setPostTypeId] = useState<number | null>(null);
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

  const startAddSubField = (parentId: number) => {
    resetForm();
    setFormData((prev) => ({
      ...prev,
      parentId,
      order: childFieldsOf(parentId).length,
    }));
    setShowForm(true);
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

  // Resolve postType slug → id, then fetch fields
  useEffect(() => {
    (async () => {
      try {
        const ptRes = await fetch('/api/post-types');
        const ptData = await ptRes.json();
        if (!ptData.success) return;
        const match = ptData.data.find((pt: { slug: string }) => pt.slug === postTypeSlug);
        if (!match) {
          setLoading(false);
          return;
        }
        setPostTypeId(match.id);
        const cfRes = await fetch(`/api/custom-fields?postTypeId=${match.id}`);
        const cfData = await cfRes.json();
        if (cfData.success) setFields(cfData.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [postTypeSlug]);

  const fetchFields = async () => {
    if (!postTypeId) return;
    const res = await fetch(`/api/custom-fields?postTypeId=${postTypeId}`);
    const data = await res.json();
    if (data.success) setFields(data.data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTypeId) return;
    setError('');
    setSubmitting(true);

    const url = editingField ? `/api/custom-fields/${editingField.id}` : '/api/custom-fields';
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
          postTypeId,
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
        await fetchFields();
        onFieldsChanged();
        resetForm();
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to save' }));
        setError(data.error || 'Failed to save custom field');
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
    const res = await fetch(`/api/custom-fields/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchFields();
      onFieldsChanged();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-base font-semibold text-foreground">Manage Custom Fields</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Post type: <span className="font-medium capitalize">{postTypeSlug}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-icons animate-spin text-muted-foreground">progress_activity</span>
            </div>
          ) : !postTypeId ? (
            <div className="text-center py-8">
              <span className="material-icons text-3xl text-muted-foreground mb-2 block">warning</span>
              <p className="text-sm text-muted-foreground">
                Post type &quot;{postTypeSlug}&quot; not found. Create it in admin settings first.
              </p>
            </div>
          ) : (
            <>
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
                            ...(!editingField ? { slug: generateCustomFieldSlug(name) } : {}),
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
                      {submitting ? 'Saving...' : editingField ? 'Update Field' : 'Add Field'}
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

              {/* Fields list */}
              {topLevelFields.length === 0 && !showForm ? (
                <div className="text-center py-8">
                  <span className="material-icons text-3xl text-muted-foreground mb-2 block">input</span>
                  <p className="text-sm text-muted-foreground">No fields defined for this post type yet.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {topLevelFields.map((field) => {
                    const isContainer = field.fieldType === 'repeater' || field.fieldType === 'group';
                    const children = isContainer ? childFieldsOf(field.id) : [];
                    const isExpanded = expandedGroups.has(field.id);
                    return (
                      <div key={field.id}>
                        <div
                          className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-muted/50 group"
                        >
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
                              <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0">
                                {field.order}
                              </span>
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
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary/10 text-primary">
                                  {field.fieldType}
                                </span>
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
                        {/* Sub-fields */}
                        {isContainer && isExpanded && children.length > 0 && (
                          <div className="ml-8 mt-1 space-y-1 border-l-2 border-border pl-3">
                            {children.map((child) => (
                              <div
                                key={child.id}
                                className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 group/child"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0">
                                    {child.order}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-foreground truncate">{child.name}</span>
                                      {child.required && <span className="text-red-500 text-xs">*</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-xs font-mono text-muted-foreground">{child.slug}</span>
                                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary/10 text-primary">
                                        {child.fieldType}
                                      </span>
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
