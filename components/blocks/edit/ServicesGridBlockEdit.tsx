'use client';

import { ServicesGridBlock } from '@/types/blocks';
import MediaPicker from '@/components/admin/MediaPicker';
import { useState } from 'react';

interface ServicesGridBlockEditProps {
  block: ServicesGridBlock;
  onChange: (block: ServicesGridBlock) => void;
}

export function ServicesGridBlockEdit({ block, onChange }: ServicesGridBlockEditProps) {
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const addService = () => {
    const newService = {
      id: `service-${Date.now()}`,
      title: 'New Service',
      description: 'Service description',
    };
    onChange({
      ...block,
      services: [...block.services, newService],
    });
  };

  const updateService = (index: number, updates: Partial<typeof block.services[0]>) => {
    const newServices = [...block.services];
    newServices[index] = { ...newServices[index], ...updates };
    onChange({ ...block, services: newServices });
  };

  const removeService = (index: number) => {
    onChange({
      ...block,
      services: block.services.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Section Title
        </label>
        <input
          type="text"
          value={block.title || ''}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Our Services"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Section Description
        </label>
        <textarea
          value={block.description || ''}
          onChange={(e) => onChange({ ...block, description: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Description..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Columns
        </label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ ...block, columns: parseInt(e.target.value) as ServicesGridBlock['columns'] })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-medium text-foreground">Services</h4>
          <button
            type="button"
            onClick={addService}
            className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            + Add Service
          </button>
        </div>

        <div className="space-y-3">
          {block.services.map((service, index) => (
            <div key={service.id} className="border border-border rounded-md p-3">
              <div className="flex justify-between items-start mb-2">
                <button
                  type="button"
                  onClick={() => setExpandedService(expandedService === service.id ? null : service.id)}
                  className="text-sm font-medium text-foreground hover:text-primary flex-1 text-left"
                >
                  {service.title}
                </button>
                <button
                  type="button"
                  onClick={() => removeService(index)}
                  className="text-red-500 hover:text-red-700 text-sm ml-2"
                >
                  Remove
                </button>
              </div>

              {expandedService === service.id && (
                <div className="space-y-3 mt-3">
                  <input
                    type="text"
                    value={service.title}
                    onChange={(e) => updateService(index, { title: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Service title"
                  />
                  <textarea
                    value={service.description}
                    onChange={(e) => updateService(index, { description: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Service description"
                  />
                  <input
                    type="text"
                    value={service.link || ''}
                    onChange={(e) => updateService(index, { link: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Link URL (optional)"
                  />
                  <input
                    type="text"
                    value={service.icon || ''}
                    onChange={(e) => updateService(index, { icon: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Icon emoji or text (optional)"
                  />
                  <MediaPicker
                    value={service.image || ''}
                    onChange={(url) => updateService(index, { image: url })}
                    label="Service Image (optional)"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
