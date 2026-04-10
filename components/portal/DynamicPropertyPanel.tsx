'use client';

import { useState } from 'react';
import type { PropSchema } from '@/types/visual-editor';
import MediaPicker from '@/components/admin/MediaPicker';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';

interface DynamicPropertyPanelProps {
  inputs: PropSchema[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  siteId?: number;
}

export function DynamicPropertyPanel({ inputs, values, onChange, siteId }: DynamicPropertyPanelProps) {
  return (
    <div className="space-y-4">
      {inputs.map((input) => (
        <PropertyField
          key={input.name}
          schema={input}
          value={values[input.name] ?? input.defaultValue}
          onChange={(val) => onChange(input.name, val)}
          siteId={siteId}
        />
      ))}
    </div>
  );
}

function PropertyField({
  schema,
  value,
  onChange,
  siteId,
}: {
  schema: PropSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  siteId?: number;
}) {
  switch (schema.type) {
    case 'string':
    case 'url':
      return (
        <label className="block">
          <span className="text-sm font-medium text-foreground">{schema.label}</span>
          <input
            type={schema.type === 'url' ? 'url' : 'text'}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder={schema.label}
          />
        </label>
      );

    case 'richtext':
      return (
        <div className="block">
          <span className="text-sm font-medium text-foreground">{schema.label}</span>
          <div className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-within:border-primary focus-within:ring-1 focus-within:ring-primary min-h-[4rem]">
            <RichTextEditable
              html={(value as string) || ''}
              onChange={(html) => onChange(html)}
              placeholder={schema.label}
              className="outline-none min-h-[2em]"
            />
          </div>
        </div>
      );

    case 'number':
      return (
        <label className="block">
          <span className="text-sm font-medium text-foreground">{schema.label}</span>
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </label>
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-foreground">{schema.label}</span>
        </label>
      );

    case 'enum':
      return (
        <label className="block">
          <span className="text-sm font-medium text-foreground">{schema.label}</span>
          <select
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">Select...</option>
            {schema.enumOptions?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      );

    case 'color':
      return (
        <TokenColorPicker
          label={schema.label}
          value={(value as string) || ''}
          onChange={(v) => onChange(v)}
          placeholder="#000000"
        />
      );

    case 'image':
      return (
        <div className="block">
          <span className="text-sm font-medium text-foreground">{schema.label}</span>
          <div className="mt-1">
            <MediaPicker
              value={(value as string) || ''}
              onChange={(url) => onChange(url)}
              label={schema.label}
              mimeTypeFilter="image"
              apiEndpoint={siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/media'}
            />
          </div>
        </div>
      );

    case 'list':
      return <ListField schema={schema} value={value as unknown[] || []} onChange={onChange} siteId={siteId} />;

    default:
      return null;
  }
}

function ListField({
  schema,
  value,
  onChange,
  siteId,
}: {
  schema: PropSchema;
  value: unknown[];
  onChange: (value: unknown) => void;
  siteId?: number;
}) {
  const [items, setItems] = useState<unknown[]>(Array.isArray(value) ? value : []);

  const updateItems = (newItems: unknown[]) => {
    setItems(newItems);
    onChange(newItems);
  };

  const addItem = () => {
    const defaults: Record<string, unknown> = {};
    schema.listItemSchema?.forEach((s) => {
      if (s.defaultValue !== undefined) defaults[s.name] = s.defaultValue;
    });
    updateItems([...items, defaults]);
  };

  const removeItem = (index: number) => {
    updateItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, name: string, val: unknown) => {
    const updated = [...items];
    updated[index] = { ...(updated[index] as Record<string, unknown>), [name]: val };
    updateItems(updated);
  };

  return (
    <div className="block">
      <span className="text-sm font-medium text-foreground">{schema.label}</span>
      <div className="mt-1 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="rounded border border-border p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground">Item {i + 1}</span>
              <button
                onClick={() => removeItem(i)}
                className="text-xs text-destructive hover:text-destructive"
              >
                Remove
              </button>
            </div>
            {schema.listItemSchema?.map((subSchema) => (
              <div key={subSchema.name} className="mb-2">
                <PropertyField
                  schema={subSchema}
                  value={(item as Record<string, unknown>)?.[subSchema.name]}
                  onChange={(val) => updateItem(i, subSchema.name, val)}
                  siteId={siteId}
                />
              </div>
            ))}
          </div>
        ))}
        <button
          onClick={addItem}
          className="w-full rounded border border-dashed border-border py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground"
        >
          + Add Item
        </button>
      </div>
    </div>
  );
}
