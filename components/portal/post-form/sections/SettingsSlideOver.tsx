// Tabbed settings slide-over (general / SEO / taxonomy / custom fields) used in iframe mode.
'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchCustomFieldDefs, fetchCustomFieldValues, saveCustomFieldValue } from '../_lib/api';
import type { CustomFieldDef, Post, SettingsTab, TaxonomyItem } from '../_lib/types';
import type { ContentTypeOption } from '@/lib/hooks/useContentTypes';
import { ContentTypeSelect } from './ContentTypeSelect';
import { CustomFieldsSection } from './CustomFieldsSection';
import { FeaturedImageSection } from './FeaturedImageSection';
import { SeoSection } from './SeoSection';
import { TaxonomySection } from './TaxonomySection';
import { TitleSection } from './TitleSection';

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'tune' },
  { id: 'seo', label: 'SEO', icon: 'search' },
  { id: 'taxonomy', label: 'Taxonomy', icon: 'label' },
  { id: 'custom-fields', label: 'Custom Fields', icon: 'input' },
];

interface SettingsSlideOverProps {
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
  handleTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  siteId: number;
  contentTypes: ContentTypeOption[];
  availableCategories: TaxonomyItem[];
  setAvailableCategories: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
  availableTags: TaxonomyItem[];
  setAvailableTags: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
  onClose: () => void;
}

export function SettingsSlideOver({
  formData,
  setFormData,
  handleTitleChange,
  siteId,
  contentTypes,
  availableCategories,
  setAvailableCategories,
  availableTags,
  setAvailableTags,
  onClose,
}: SettingsSlideOverProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [customFieldsLoaded, setCustomFieldsLoaded] = useState(false);
  const [showManageFieldsModal, setShowManageFieldsModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load custom fields when tab is activated
  useEffect(() => {
    if (activeTab !== 'custom-fields' || customFieldsLoaded) return;
    let cancelled = false;
    (async () => {
      const defs = await fetchCustomFieldDefs();
      if (!cancelled) setCustomFieldDefs(defs);
      if (formData.id) {
        const vals = await fetchCustomFieldValues(formData.id);
        if (!cancelled) setCustomFieldValues(vals);
      }
      if (!cancelled) setCustomFieldsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [activeTab, customFieldsLoaded, formData.id]);

  const updateCustomFieldValue = (fieldId: number, value: string) => {
    setCustomFieldValues(prev => ({ ...prev, [fieldId]: value }));
    if (!formData.id) return;

    setSaveStatus('saving');
    if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);

    saveCustomFieldValue(formData.id, fieldId, value)
      .then((ok) => {
        setSaveStatus(ok ? 'saved' : 'error');
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      })
      .catch(() => {
        setSaveStatus('error');
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-96 bg-card border-l border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Page Details</h3>
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
                <span className="material-icons text-sm animate-spin">progress_activity</span>
                Saving
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="material-icons text-sm">check_circle</span>
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <span className="material-icons text-sm">error</span>
                Save failed
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-xl">close</span>
          </button>
        </div>

        {/* Tabs — horizontal scroll */}
        <div className="flex overflow-x-auto border-b border-border shrink-0 scrollbar-none">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <TitleSection
                formData={formData}
                setFormData={setFormData}
                handleTitleChange={handleTitleChange}
              />
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
                <ContentTypeSelect
                  value={formData.postType}
                  contentTypes={contentTypes}
                  onChange={(slug) => setFormData(prev => ({ ...prev, postType: slug }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Switching the type re-applies that type’s template to the post and reloads the preview.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Excerpt</label>
                <textarea
                  value={formData.excerpt}
                  onChange={e => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
                  rows={3}
                  placeholder="Short description..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
                />
              </div>
              <FeaturedImageSection siteId={siteId} formData={formData} setFormData={setFormData} />
            </div>
          )}

          {activeTab === 'seo' && (
            <SeoSection siteId={siteId} formData={formData} setFormData={setFormData} />
          )}

          {activeTab === 'taxonomy' && (
            <TaxonomySection
              siteId={siteId}
              formData={formData}
              setFormData={setFormData}
              availableCategories={availableCategories}
              setAvailableCategories={setAvailableCategories}
              availableTags={availableTags}
              setAvailableTags={setAvailableTags}
            />
          )}

          {activeTab === 'custom-fields' && (
            <CustomFieldsSection
              customFieldDefs={customFieldDefs}
              customFieldValues={customFieldValues}
              updateCustomFieldValue={updateCustomFieldValue}
              siteId={siteId}
              postType={formData.postType}
              showManageFieldsModal={showManageFieldsModal}
              setShowManageFieldsModal={setShowManageFieldsModal}
              setCustomFieldsLoaded={setCustomFieldsLoaded}
            />
          )}
        </div>
      </div>
    </>
  );
}
