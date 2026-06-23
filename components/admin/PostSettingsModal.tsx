'use client';

import { useState } from 'react';
import MediaPicker from './MediaPicker';
import { slugify } from '@/lib/publishing/slug';

interface PostSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: {
    title: string;
    slug: string;
    postType: string;
    excerpt?: string;
    coverImage?: string;
    published: boolean;
    publishedAt?: string | null;
  };
  onFormDataChange: (updates: Partial<PostSettingsModalProps['formData']>) => void;
  postTypes: Array<{ id: number; name: string; slug: string; icon: string; active: boolean }>;
  customFields: Array<{
    id: number;
    postTypeId: number;
    name: string;
    slug: string;
    fieldType: string;
    options: string[] | null;
    required: boolean;
    defaultValue?: string | null;
    helpText?: string | null;
    order: number;
  }>;
  customFieldValues: Record<string, string>;
  onCustomFieldChange: (slug: string, value: string) => void;
  mode: 'create' | 'edit';
  users: Array<{ id: number; name: string; email: string; role: string; active: boolean }>;
  onPostTypeChange: (postType: string) => void;
  renderCustomField: (field: any) => React.ReactNode;
}

export function PostSettingsModal({
  isOpen,
  onClose,
  formData,
  onFormDataChange,
  postTypes,
  customFields,
  customFieldValues,
  onCustomFieldChange,
  mode,
  users,
  onPostTypeChange,
  renderCustomField,
}: PostSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'custom-fields'>('general');

  if (!isOpen) return null;

  const generateSlug = (title: string) => slugify(title);

  const handleTitleChange = (title: string) => {
    onFormDataChange({
      title,
      slug: mode === 'create' ? generateSlug(title) : formData.slug,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div
          className="relative bg-background border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-xl font-semibold">Post Settings</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-accent rounded-md transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-border">
            <nav className="flex">
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'general'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('custom-fields')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'custom-fields'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Custom Fields
                {customFields.length > 0 && (
                  <span className="ml-2 text-xs bg-accent px-1.5 py-0.5 rounded">
                    {customFields.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label htmlFor="modal-title" className="block text-sm font-medium text-foreground">
                    Title *
                  </label>
                  <input
                    type="text"
                    id="modal-title"
                    required
                    value={formData.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="modal-slug" className="block text-sm font-medium text-foreground">
                    Slug *
                  </label>
                  <input
                    type="text"
                    id="modal-slug"
                    required
                    value={formData.slug}
                    onChange={(e) => onFormDataChange({ slug: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="modal-postType" className="block text-sm font-medium text-foreground">
                    Post Type *
                  </label>
                  <select
                    id="modal-postType"
                    value={formData.postType}
                    onChange={(e) => onPostTypeChange(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
                  >
                    {postTypes.map((type) => (
                      <option key={type.slug} value={type.slug}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="modal-excerpt" className="block text-sm font-medium text-foreground">
                    Excerpt
                  </label>
                  <textarea
                    id="modal-excerpt"
                    rows={3}
                    value={formData.excerpt}
                    onChange={(e) => onFormDataChange({ excerpt: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
                    placeholder="A short description..."
                  />
                </div>

                <MediaPicker
                  value={formData.coverImage || ''}
                  onChange={(url) => onFormDataChange({ coverImage: url })}
                  label="Cover Image"
                />

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="modal-published"
                    checked={formData.published}
                    onChange={(e) =>
                      onFormDataChange({
                        published: e.target.checked,
                        publishedAt: e.target.checked ? new Date().toISOString() : null,
                      })
                    }
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <label htmlFor="modal-published" className="ml-2 block text-sm text-foreground">
                    Published
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'custom-fields' && (
              <div className="space-y-6">
                {customFields.length > 0 ? (
                  customFields.map((field) => (
                    <div key={field.id}>
                      <label htmlFor={`modal-${field.slug}`} className="block text-sm font-medium text-foreground">
                        {field.name} {field.required && '*'}
                      </label>
                      {field.fieldType !== 'checkbox' && field.helpText && (
                        <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                      )}
                      {renderCustomField(field)}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No custom fields defined for this post type.</p>
                    <p className="text-sm mt-2">You can add custom fields in the Post Types section.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
