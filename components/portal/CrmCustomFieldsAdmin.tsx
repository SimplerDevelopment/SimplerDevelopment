'use client';

import { useEffect, useState } from 'react';

type EntityType = 'contact' | 'company' | 'deal';
type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'url'
  | 'email'
  | 'phone'
  | 'boolean';

interface FieldDef {
  id: number;
  entityType: EntityType;
  fieldName: string;
  fieldType: FieldType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
  category: string | null;
}

const FIELD_TYPES: { value: FieldType; label: string; icon: string; supportsOptions: boolean }[] = [
  { value: 'text', label: 'Text', icon: 'text_fields', supportsOptions: false },
  { value: 'number', label: 'Number', icon: 'pin', supportsOptions: false },
  { value: 'date', label: 'Date', icon: 'calendar_today', supportsOptions: false },
  { value: 'select', label: 'Select', icon: 'arrow_drop_down_circle', supportsOptions: true },
  { value: 'multiselect', label: 'Multi-select', icon: 'checklist', supportsOptions: true },
  { value: 'url', label: 'URL', icon: 'link', supportsOptions: false },
  { value: 'email', label: 'Email', icon: 'mail', supportsOptions: false },
  { value: 'phone', label: 'Phone', icon: 'phone', supportsOptions: false },
  { value: 'boolean', label: 'Yes / No', icon: 'toggle_on', supportsOptions: false },
];

const ENTITY_TABS: { value: EntityType; label: string; icon: string }[] = [
  { value: 'contact', label: 'Contacts', icon: 'person' },
  { value: 'company', label: 'Companies', icon: 'business' },
  { value: 'deal', label: 'Deals', icon: 'handshake' },
];

const inputClass =
  'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50';

function typeIcon(t: FieldType): string {
  return FIELD_TYPES.find(f => f.value === t)?.icon ?? 'help';
}

function typeSupportsOptions(t: FieldType): boolean {
  return FIELD_TYPES.find(f => f.value === t)?.supportsOptions ?? false;
}

export default function CrmCustomFieldsAdmin() {
  const [entityType, setEntityType] = useState<EntityType>('contact');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FieldType>('text');
  const [newOptions, setNewOptions] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editOptions, setEditOptions] = useState('');
  const [editRequired, setEditRequired] = useState(false);
  const [editCategory, setEditCategory] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/portal/crm/custom-fields?entityType=${entityType}`);
    const d = await res.json();
    setFields(d.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/portal/crm/custom-fields?entityType=${entityType}`);
      const d = await res.json();
      setFields(d.data ?? []);
      setLoading(false);
    })();
  }, [entityType]);

  function resetCreateForm() {
    setNewName('');
    setNewType('text');
    setNewOptions('');
    setNewRequired(false);
    setNewCategory('');
  }

  async function createField(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!newName.trim()) return;
    const optionList = typeSupportsOptions(newType)
      ? newOptions.split(',').map(s => s.trim()).filter(Boolean)
      : null;
    if (typeSupportsOptions(newType) && (!optionList || optionList.length === 0)) {
      setError('Select/multi-select requires at least one option.');
      return;
    }
    setCreating(true);
    const res = await fetch('/api/portal/crm/custom-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType,
        fieldName: newName.trim(),
        fieldType: newType,
        options: optionList,
        required: newRequired,
        sortOrder: fields.length,
        category: newCategory.trim() || null,
      }),
    });
    const d = await res.json();
    setCreating(false);
    if (d.success) {
      setFields(prev => [...prev, d.data]);
      resetCreateForm();
    } else {
      setError(d.message ?? 'Failed to create field');
    }
  }

  function startEdit(f: FieldDef) {
    setEditingId(f.id);
    setEditName(f.fieldName);
    setEditOptions((f.options ?? []).join(', '));
    setEditRequired(f.required);
    setEditCategory(f.category ?? '');
  }

  async function saveEdit(f: FieldDef) {
    const optionList = typeSupportsOptions(f.fieldType)
      ? editOptions.split(',').map(s => s.trim()).filter(Boolean)
      : null;
    if (typeSupportsOptions(f.fieldType) && (!optionList || optionList.length === 0)) {
      setError('Select/multi-select requires at least one option.');
      return;
    }
    const res = await fetch(`/api/portal/crm/custom-fields/${f.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fieldName: editName.trim(),
        options: optionList,
        required: editRequired,
        category: editCategory.trim() || null,
      }),
    });
    const d = await res.json();
    if (d.success) {
      setFields(prev => prev.map(x => (x.id === f.id ? { ...x, ...d.data } : x)));
      setEditingId(null);
      setError('');
    } else {
      setError(d.message ?? 'Failed to update field');
    }
  }

  async function deleteField(id: number) {
    if (!confirm('Delete this field? All values stored against it will be removed.')) return;
    const res = await fetch(`/api/portal/crm/custom-fields/${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (d.success) {
      setFields(prev => prev.filter(x => x.id !== id));
    } else {
      setError(d.message ?? 'Failed to delete field');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-foreground text-lg">Custom Fields</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Define extra fields to capture on contacts, companies, and deals. Use{' '}
          <span className="font-medium text-foreground">Category</span> to group related fields into
          tabs in record views.
        </p>
      </div>

      {/* Entity tabs */}
      <div className="flex border-b border-border">
        {ENTITY_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => {
              setEntityType(tab.value);
              setEditingId(null);
              resetCreateForm();
              setError('');
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              entityType === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}

      {/* Field list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <span className="material-icons animate-spin text-base">refresh</span>
            Loading...
          </div>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No custom fields for {ENTITY_TABS.find(t => t.value === entityType)?.label.toLowerCase()} yet.
          </p>
        ) : (
          fields.map(f => (
            <div key={f.id} className="border border-border rounded-lg p-3">
              {editingId === f.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-icons text-base text-muted-foreground shrink-0">
                      {typeIcon(f.fieldType)}
                    </span>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Field name"
                      className={inputClass}
                    />
                  </div>
                  <input
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    placeholder="Category (e.g. Tech, Location)"
                    className={inputClass}
                  />
                  {typeSupportsOptions(f.fieldType) && (
                    <input
                      value={editOptions}
                      onChange={e => setEditOptions(e.target.value)}
                      placeholder="Options (comma-separated)"
                      className={inputClass}
                    />
                  )}
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editRequired}
                        onChange={e => setEditRequired(e.target.checked)}
                        className="rounded border-border"
                      />
                      Required
                    </label>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(f)}
                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="material-icons text-base text-muted-foreground shrink-0">
                    {typeIcon(f.fieldType)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{f.fieldName}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
                        {f.fieldType}
                      </span>
                      {f.category && (
                        <span className="text-[10px] uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <span className="material-icons text-[10px]">folder</span>
                          {f.category}
                        </span>
                      )}
                      {f.required && (
                        <span className="text-[10px] uppercase tracking-wide text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                          required
                        </span>
                      )}
                    </div>
                    {f.options && f.options.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {f.options.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(f)}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      title="Edit"
                    >
                      <span className="material-icons text-base">edit</span>
                    </button>
                    <button
                      onClick={() => deleteField(f.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete"
                    >
                      <span className="material-icons text-base">delete</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create form */}
      <form onSubmit={createField} className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Add a field</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Field name"
            className={inputClass}
          />
          <select
            value={newType}
            onChange={e => setNewType(e.target.value as FieldType)}
            className={inputClass}
          >
            {FIELD_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            placeholder="Category (optional)"
            className={inputClass}
          />
        </div>
        {typeSupportsOptions(newType) && (
          <input
            value={newOptions}
            onChange={e => setNewOptions(e.target.value)}
            placeholder="Options (comma-separated, e.g. Low, Medium, High)"
            className={inputClass}
          />
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={newRequired}
              onChange={e => setNewRequired(e.target.checked)}
              className="rounded border-border"
            />
            Required
          </label>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {creating && <span className="material-icons animate-spin text-sm">refresh</span>}
            <span className="material-icons text-sm">add</span>
            Add Field
          </button>
        </div>
      </form>
    </div>
  );
}
