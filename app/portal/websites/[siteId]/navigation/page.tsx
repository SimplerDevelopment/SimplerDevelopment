'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { MenuTree } from './_components/MenuTree';
import { MenuSettings } from './_components/MenuSettings';
import { NavigationPreview } from './_components/NavigationPreview';
import { TemplatePicker } from './_components/TemplatePicker';
import { useNavigation } from './_hooks/useNavigation';

export default function NavigationEditorPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const {
    items,
    branding,
    loading,
    saving,
    dirty,
    editingId,
    sitePreviewUrl,
    setEditingId,
    addItem,
    addColumn,
    addMegaItem,
    updateItem,
    removeItem,
    moveItem,
    updateBranding,
    save,
  } = useNavigation(siteId);

  const [activeTab, setActiveTab] = useState<'items' | 'branding'>('items');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);

  const isMega = branding.navTemplate === 'mega';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-icons animate-spin text-muted-foreground">refresh</span>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Navigation Editor</h1>
            <p className="text-sm text-muted-foreground">
              Customize your site navigation, branding, and layout
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <TemplatePicker
            branding={branding}
            onSelectTemplate={(navTemplate) => updateBranding({ navTemplate })}
          />

          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <span className="material-icons text-base">{saving ? 'refresh' : 'save'}</span>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Main: Editor + Preview */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel: Editor (collapsible) */}
        <div
          className={`flex-shrink-0 border-r border-border bg-background overflow-y-auto transition-all duration-300 ${
            leftPanelOpen ? 'w-[420px]' : 'w-0 border-r-0'
          }`}
        >
          <div className={`w-[420px] ${leftPanelOpen ? '' : 'hidden'}`}>
            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab('items')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'items'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="material-icons text-base mr-1.5 align-middle">menu</span>
                Menu Items
              </button>
              <button
                onClick={() => setActiveTab('branding')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'branding'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="material-icons text-base mr-1.5 align-middle">palette</span>
                Branding
              </button>
            </div>

            {activeTab === 'items' ? (
              <MenuTree
                items={items}
                editingId={editingId}
                isMegaMenu={isMega}
                siteId={siteId}
                onSetEditingId={setEditingId}
                onUpdate={updateItem}
                onRemove={removeItem}
                onMove={moveItem}
                onAddTopLevel={() => addItem()}
                onAddChild={(parentId) => (isMega ? addColumn(parentId) : addItem(parentId))}
                onAddMegaItem={addMegaItem}
              />
            ) : (
              <MenuSettings branding={branding} onChange={updateBranding} siteId={siteId} />
            )}
          </div>
        </div>

        {/* Left panel toggle */}
        <button
          type="button"
          onClick={() => setLeftPanelOpen((prev) => !prev)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-6 h-12 flex items-center justify-center bg-background border border-border border-l-0 rounded-r-lg shadow-sm hover:bg-muted transition-colors"
          style={{ left: leftPanelOpen ? '420px' : '0px', transition: 'left 0.3s' }}
          title={leftPanelOpen ? 'Collapse panel' : 'Expand panel'}
        >
          <span className="material-icons text-sm text-muted-foreground">
            {leftPanelOpen ? 'chevron_left' : 'chevron_right'}
          </span>
        </button>

        {/* Right Panel: Live iframe Preview */}
        <NavigationPreview
          items={items}
          branding={branding}
          sitePreviewUrl={sitePreviewUrl}
        />
      </div>
    </div>
  );
}
