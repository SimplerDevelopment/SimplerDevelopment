'use client';

import { useState } from 'react';
import type { PropSchema } from '@/types/visual-editor';

interface DynamicPropertyPanelProps {
  inputs: PropSchema[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}

export function DynamicPropertyPanel({ inputs, values, onChange }: DynamicPropertyPanelProps) {
  return (
    <div className="space-y-4">
      {inputs.map((input) => (
        <PropertyField
          key={input.name}
          schema={input}
          value={values[input.name] ?? input.defaultValue}
          onChange={(val) => onChange(input.name, val)}
        />
      ))}
    </div>
  );
}

function PropertyField({
  schema,
  value,
  onChange,
}: {
  schema: PropSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (schema.type) {
    case 'string':
    case 'url':
      return (
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{schema.label}</span>
          <input
            type={schema.type === 'url' ? 'url' : 'text'}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder={schema.label}
          />
        </label>
      );

    case 'richtext':
      return (
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{schema.label}</span>
          <textarea
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </label>
      );

    case 'number':
      return (
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{schema.label}</span>
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">{schema.label}</span>
        </label>
      );

    case 'enum':
      return (
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{schema.label}</span>
          <select
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{schema.label}</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={(value as string) || '#000000'}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border border-gray-300"
            />
            <input
              type="text"
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              className="block flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="#000000"
            />
          </div>
        </label>
      );

    case 'image':
      return (
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{schema.label}</span>
          <input
            type="url"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Image URL"
          />
        </label>
      );

    case 'list':
      return <ListField schema={schema} value={value as unknown[] || []} onChange={onChange} />;

    default:
      return null;
  }
}

function ListField({
  schema,
  value,
  onChange,
}: {
  schema: PropSchema;
  value: unknown[];
  onChange: (value: unknown) => void;
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
      <span className="text-sm font-medium text-gray-700">{schema.label}</span>
      <div className="mt-1 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="rounded border border-gray-200 p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500">Item {i + 1}</span>
              <button
                onClick={() => removeItem(i)}
                className="text-xs text-red-500 hover:text-red-700"
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
                />
              </div>
            ))}
          </div>
        ))}
        <button
          onClick={addItem}
          className="w-full rounded border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
        >
          + Add Item
        </button>
      </div>
    </div>
  );
}
