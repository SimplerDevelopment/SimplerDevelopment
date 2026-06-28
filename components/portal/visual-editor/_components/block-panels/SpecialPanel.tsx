'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { Block } from '@/types/blocks';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import {
  Field,
  TextareaField,
  RichTextField,
  SelectField,
  ColorField,
  CheckboxField,
  NumberField,
} from '../../panel-fields';
import { ListEditor } from '../ListEditor';
import { SurveyResultsEditor } from '../SurveyResultsEditor';
import { HtmlEmbedEditor } from '../HtmlEmbedEditor';
import { HtmlRenderEditor } from '../../HtmlRenderEditor';
import { BookingPagePicker } from '../pickers/BookingPagePicker';
import { SurveyPicker } from '../pickers/SurveyPicker';
import type { PanelProps } from './ContentPanel';

// ─── Special Panel ────────────────────────────────────────────────────────────
// booking, survey, popup, deck-next-slide, deck-jump-to, booking-menu,
// social-links, timeline, accordion, tabs, sticky-scroll-tabs, blog-posts,
// survey-results, html-embed, html-render, site-footer

export function SpecialPanel({ block, onUpdate, siteId }: PanelProps) {
  const b = block as unknown as Record<string, unknown>;
  const uid = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';
  return (
    <>
      {/* ── Accordion Block — with item editor ── */}
      {block.type === 'accordion' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <ListEditor
            label="Items"
            items={(block.items || []).map(item => ({ id: item.id, fields: { title: item.title, content: item.content } }))}
            fieldDefs={[
              { name: 'title', label: 'Title', placeholder: 'Section title' },
              { name: 'content', label: 'Content', placeholder: 'Section content', multiline: true },
            ]}
            onAdd={() => onUpdate({ items: [...(block.items || []), { id: uid(), title: 'New section', content: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ items: block.items.filter(i => i.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ items: block.items.map(i => i.id === id ? { ...i, [field]: value } : i) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ items: ids.map(id => block.items.find(i => i.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Tabs Block — with tab editor ── */}
      {block.type === 'tabs' && (
        <>
          <ListEditor
            label="Tabs"
            items={(block.tabs || []).map(tab => ({ id: tab.id, fields: { label: tab.label } }))}
            fieldDefs={[{ name: 'label', label: 'Tab Label', placeholder: 'Tab name' }]}
            onAdd={() => onUpdate({ tabs: [...(block.tabs || []), { id: uid(), label: 'New Tab', blocks: [] }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ tabs: block.tabs.filter(t => t.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ tabs: block.tabs.map(t => t.id === id ? { ...t, [field]: value } : t) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ tabs: ids.map(id => block.tabs.find(t => t.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
          <p className="text-xs text-muted-foreground">Edit tab content via the layers panel.</p>
        </>
      )}

      {/* ── Sticky Scroll Tabs Block ── */}
      {block.type === 'sticky-scroll-tabs' && (
        <>
          <RichTextField label="Overline" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} singleLine />
          <RichTextField label="Title" value={(b.title as string) || ''} onChange={(v) => onUpdate({ title: v || undefined } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={(b.description as string) || ''} onChange={(v) => onUpdate({ description: v || undefined } as Partial<Block>)} />
          <ListEditor
            label="Panels"
            items={(block.panels || []).map(p => ({ id: p.id, fields: { label: p.label, icon: p.icon || '' } }))}
            fieldDefs={[
              { name: 'label', label: 'Panel Label', placeholder: 'Panel name' },
              { name: 'icon', label: 'Material Icon (optional)', placeholder: 'rocket_launch' },
            ]}
            onAdd={() => onUpdate({ panels: [...(block.panels || []), { id: uid(), label: 'New Panel', blocks: [] }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ panels: block.panels.filter(p => p.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ panels: block.panels.map(p => p.id === id ? { ...p, [field]: value || undefined } : p) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ panels: ids.map(id => block.panels.find(p => p.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sticky Top Offset (px)" value={String(b.stickyTopOffset ?? 80)} onChange={(v) => { const n = Number(v); onUpdate({ stickyTopOffset: Number.isNaN(n) ? undefined : n } as Partial<Block>); }} />
            <Field label="Panel Min Height" value={(b.panelMinHeight as string) || ''} onChange={(v) => onUpdate({ panelMinHeight: v || undefined } as Partial<Block>)} />
          </div>
          <Field label="Tab Border Radius" value={(b.tabBorderRadius as string) || ''} onChange={(v) => onUpdate({ tabBorderRadius: v || undefined } as Partial<Block>)} />
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Active Tab Background" value={(b.activeTabBackground as string) || ''} onChange={(v) => onUpdate({ activeTabBackground: v || undefined } as Partial<Block>)} />
            <ColorField label="Active Tab Text" value={(b.activeTabColor as string) || ''} onChange={(v) => onUpdate({ activeTabColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Inactive Tab Background" value={(b.inactiveTabBackground as string) || ''} onChange={(v) => onUpdate({ inactiveTabBackground: v || undefined } as Partial<Block>)} />
            <ColorField label="Inactive Tab Text" value={(b.inactiveTabColor as string) || ''} onChange={(v) => onUpdate({ inactiveTabColor: v || undefined } as Partial<Block>)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Mobile Active Background" value={(b.mobileActiveTabBackground as string) || ''} onChange={(v) => onUpdate({ mobileActiveTabBackground: v || undefined } as Partial<Block>)} />
            <ColorField label="Mobile Active Text" value={(b.mobileActiveTabColor as string) || ''} onChange={(v) => onUpdate({ mobileActiveTabColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Mobile Inactive Background" value={(b.mobileInactiveTabBackground as string) || ''} onChange={(v) => onUpdate({ mobileInactiveTabBackground: v || undefined } as Partial<Block>)} />
            <ColorField label="Mobile Inactive Text" value={(b.mobileInactiveTabColor as string) || ''} onChange={(v) => onUpdate({ mobileInactiveTabColor: v || undefined } as Partial<Block>)} />
          </div>
          <SelectField label="Mobile Tab Behavior" value={(b.mobileTabsBehavior as string) || 'carousel'} options={['carousel', 'hide']} onChange={(v) => onUpdate({ mobileTabsBehavior: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Blog Posts Block ── */}
      {block.type === 'blog-posts' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Post Type" value={b.postType as string} onChange={(v) => onUpdate({ postType: v } as Partial<Block>)} />
          <Field label="Category Slug" value={b.categorySlug as string} onChange={(v) => onUpdate({ categorySlug: v } as Partial<Block>)} />
          <SelectField label="Limit" value={String(b.limit || 6)} options={['3','6','9','12']} onChange={(v) => onUpdate({ limit: Number(v) } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <CheckboxField label="Show Excerpt" checked={b.showExcerpt as boolean ?? true} onChange={(v) => onUpdate({ showExcerpt: v } as Partial<Block>)} />
        </>
      )}

      {block.type === 'booking' && (
        <>
          <BookingPagePicker value={b.slug as string} onChange={(v) => onUpdate({ slug: v } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Embed Height" value={(b.height as string) || '700px'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
          <CheckboxField label="Show Booking Page Title" checked={b.showPageTitle !== false} onChange={(v) => onUpdate({ showPageTitle: v } as Partial<Block>)} />
          <CheckboxField label="Show Description" checked={b.showDescription !== false} onChange={(v) => onUpdate({ showDescription: v } as Partial<Block>)} />
          <CheckboxField label="Show Step Indicator" checked={b.showSteps !== false} onChange={(v) => onUpdate({ showSteps: v } as Partial<Block>)} />
          <CheckboxField label="Show Logo" checked={b.showLogo !== false} onChange={(v) => onUpdate({ showLogo: v } as Partial<Block>)} />

          {/* Style Overrides */}
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">palette</span>
              Style Overrides
            </summary>
            <div className="pt-3 space-y-3">
              <ColorField label="Primary Color" value={(b.styleOverrides as Record<string,string>)?.primaryColor || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), primaryColor: v } } as Partial<Block>)} />
              <ColorField label="Background" value={(b.styleOverrides as Record<string,string>)?.backgroundColor || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), backgroundColor: v } } as Partial<Block>)} />
              <ColorField label="Text Color" value={(b.styleOverrides as Record<string,string>)?.textColor || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), textColor: v } } as Partial<Block>)} />
              <ColorField label="Form Background" value={(b.styleOverrides as Record<string,string>)?.formBg || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), formBg: v } } as Partial<Block>)} />
              <ColorField label="Input Background" value={(b.styleOverrides as Record<string,string>)?.inputBg || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), inputBg: v } } as Partial<Block>)} />
              <ColorField label="Button Background" value={(b.styleOverrides as Record<string,string>)?.buttonBg || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), buttonBg: v } } as Partial<Block>)} />
              <ColorField label="Button Text" value={(b.styleOverrides as Record<string,string>)?.buttonText || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), buttonText: v } } as Partial<Block>)} />
              <div>
                <span className="text-xs font-medium text-muted-foreground">Heading Font</span>
                <GoogleFontPicker value={(b.styleOverrides as Record<string,string>)?.headingFont || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), headingFont: v } } as Partial<Block>)} />
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Body Font</span>
                <GoogleFontPicker value={(b.styleOverrides as Record<string,string>)?.bodyFont || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), bodyFont: v } } as Partial<Block>)} />
              </div>
              <SelectField label="Button Radius" value={(b.styleOverrides as Record<string,string>)?.buttonBorderRadius || ''} options={['', '0px', '4px', '8px', '12px', '9999px']} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), buttonBorderRadius: v } } as Partial<Block>)} />
              <SelectField label="Card Radius" value={(b.styleOverrides as Record<string,string>)?.borderRadius || ''} options={['', '0px', '4px', '8px', '12px', '16px', '24px']} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), borderRadius: v } } as Partial<Block>)} />
            </div>
          </details>
        </>
      )}

      {block.type === 'survey' && (
        <>
          <SurveyPicker value={b.slug as string} onChange={(v) => onUpdate({ slug: v } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Embed Height" value={(b.height as string) || '700px'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
          <CheckboxField label="Show Survey Title" checked={b.showPageTitle !== false} onChange={(v) => onUpdate({ showPageTitle: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Popup Block (modal triggered by load / time / scroll / exit-intent) ── */}
      {block.type === 'popup' && (
        <>
          <RichTextField label="Headline" value={b.headline as string} onChange={(v) => onUpdate({ headline: v } as Partial<Block>)} singleLine />
          <RichTextField label="Body" value={(b.body as string) || ''} onChange={(v) => onUpdate({ body: v || undefined } as Partial<Block>)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="CTA Label" value={(b.ctaLabel as string) || ''} onChange={(v) => onUpdate({ ctaLabel: v || undefined } as Partial<Block>)} />
            <Field label="CTA URL" value={(b.ctaUrl as string) || ''} onChange={(v) => onUpdate({ ctaUrl: v || undefined } as Partial<Block>)} />
          </div>
          <SelectField label="Trigger" value={(b.trigger as string) || 'time-delay'} options={['page-load','time-delay','scroll-percent','exit-intent']} onChange={(v) => onUpdate({ trigger: v } as Partial<Block>)} />
          {(b.trigger as string) === 'time-delay' && (
            <NumberField label="Delay (seconds)" value={(b.delaySeconds as number) ?? 5} min={0} onChange={(v) => onUpdate({ delaySeconds: v } as Partial<Block>)} />
          )}
          {(b.trigger as string) === 'scroll-percent' && (
            <NumberField label="Scroll Percent (0-100)" value={(b.scrollPercent as number) ?? 50} min={0} max={100} onChange={(v) => onUpdate({ scrollPercent: Math.max(0, Math.min(100, v)) } as Partial<Block>)} />
          )}
          <SelectField label="Frequency" value={(b.frequency as string) || 'once-per-session'} options={['always','once-per-session','once-per-week']} onChange={(v) => onUpdate({ frequency: v } as Partial<Block>)} />
          <CheckboxField label="Dismissable (close button + Esc + click backdrop)" checked={(b.dismissable as boolean) !== false} onChange={(v) => onUpdate({ dismissable: v } as Partial<Block>)} />
          <p className="text-xs text-muted-foreground">Frequency is persisted in <code className="font-mono">localStorage</code> keyed by block id.</p>
        </>
      )}

      {block.type === 'deck-next-slide' && (
        <>
          <Field label="Button Text" value={(b.text as string) || 'Next Slide'} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <SelectField label="Variant" value={(b.variant as string) || 'primary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <Field label="Icon" value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v } as Partial<Block>)} />
          <SelectField label="Icon Position" value={(b.iconPosition as string) || 'left'} options={['left','right']} onChange={(v) => onUpdate({ iconPosition: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'deck-jump-to' && (
        <>
          <Field label="Button Text" value={(b.text as string) || 'Jump To'} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <Field label="Target Slide #" value={String((b.targetSlide as number) || 1)} onChange={(v) => onUpdate({ targetSlide: parseInt(v, 10) || 1 } as Partial<Block>)} />
          <SelectField label="Variant" value={(b.variant as string) || 'secondary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <Field label="Icon" value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v } as Partial<Block>)} />
          <SelectField label="Icon Position" value={(b.iconPosition as string) || 'left'} options={['left','right']} onChange={(v) => onUpdate({ iconPosition: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Booking Menu Block ── */}
      {block.type === 'booking-menu' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} singleLine />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <p className="text-xs text-muted-foreground">Booking pages are pulled live from this site&apos;s published bookings. Add booking pages from the Bookings admin to populate the grid.</p>
        </>
      )}

      {/* ── Social Links Block ── */}
      {block.type === 'social-links' && (
        <>
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <SelectField label="Icon Size (px)" value={String((b.iconSize as number) ?? 32)} options={['24','32','40']} onChange={(v) => onUpdate({ iconSize: Number(v) } as Partial<Block>)} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Links ({((b.links as Array<{platform: string; url: string}>) || []).length})</span>
            </div>
            {((b.links as Array<{platform: string; url: string}>) || []).map((link, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={link.platform}
                  onChange={(e) => {
                    const next = [...((b.links as Array<{platform: string; url: string}>) || [])];
                    next[i] = { ...next[i], platform: e.target.value };
                    onUpdate({ links: next } as Partial<Block>);
                  }}
                  className="text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
                >
                  {(['facebook','twitter','instagram','linkedin','youtube','tiktok'] as const).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => {
                    const next = [...((b.links as Array<{platform: string; url: string}>) || [])];
                    next[i] = { ...next[i], url: e.target.value };
                    onUpdate({ links: next } as Partial<Block>);
                  }}
                  className="flex-1 text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
                  placeholder="https://"
                />
                <button
                  type="button"
                  onClick={() => onUpdate({ links: ((b.links as Array<{platform: string; url: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)}
                  className="px-2 py-2 text-xs rounded border border-border text-destructive hover:bg-destructive/10"
                >
                  <span className="material-icons text-xs">delete</span>
                </button>
              </div>
            ))}
            {((b.links as Array<{platform: string; url: string}>) || []).length < 6 && (
              <button
                type="button"
                onClick={() => onUpdate({ links: [...((b.links as Array<{platform: string; url: string}>) || []), { platform: 'facebook', url: '' }] } as Partial<Block>)}
                className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                + Add Link
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Timeline Block ── */}
      {block.type === 'timeline' && (
        <>
          <Field label="Overline" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <SelectField label="Layout" value={(b.layout as string) || 'alternating'} options={['alternating','left']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <div className="grid grid-cols-3 gap-2">
            <ColorField label="Line Color" value={(b.lineColor as string) || ''} onChange={(v) => onUpdate({ lineColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Number Color" value={(b.numberColor as string) || ''} onChange={(v) => onUpdate({ numberColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Node Color" value={(b.nodeColor as string) || ''} onChange={(v) => onUpdate({ nodeColor: v || undefined } as Partial<Block>)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Steps ({((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []).length})</span>
              <button type="button" onClick={() => onUpdate({ steps: [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []), { id: `step-${Date.now()}`, title: '', description: '' }] } as Partial<Block>)} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
            </div>
            {((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []).map((step, i) => (
              <div key={step.id ?? i} className="space-y-1 p-2 rounded border border-border">
                <input type="text" value={step.number || ''} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], number: e.target.value || undefined }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Number (e.g. 01) — optional" />
                <input type="text" value={step.icon || ''} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], icon: e.target.value || undefined }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Material Icon name (optional, alt to number)" />
                <input type="text" value={step.title} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], title: e.target.value }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Step title" />
                <textarea value={step.description} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], description: e.target.value }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Step description" rows={2} />
                <button type="button" onClick={() => onUpdate({ steps: ((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Survey Results Block ── */}
      {block.type === 'survey-results' && (
        <SurveyResultsEditor block={block} onUpdate={onUpdate} />
      )}

      {/* ── HTML Embed Block ── */}
      {block.type === 'html-embed' && (
        <HtmlEmbedEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}

      {/* ── HTML Render Block (with field-based content management) ── */}
      {block.type === 'html-render' && (
        <HtmlRenderEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}

      {/* ── Site Footer Block ── */}
      {block.type === 'site-footer' && (
        <>
          <Field label="Logo URL" value={(b.logoUrl as string) || ''} onChange={(v) => onUpdate({ logoUrl: v || undefined } as Partial<Block>)} />
          <Field label="Logo Alt" value={(b.logoAlt as string) || ''} onChange={(v) => onUpdate({ logoAlt: v || undefined } as Partial<Block>)} />
          <Field label="Wordmark" value={(b.wordmark as string) || ''} onChange={(v) => onUpdate({ wordmark: v || undefined } as Partial<Block>)} />
          <SelectField label="Brand Size" value={(b.brandSize as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ brandSize: v } as Partial<Block>)} />
          <Field label="Tagline" value={(b.tagline as string) || ''} onChange={(v) => onUpdate({ tagline: v || undefined } as Partial<Block>)} />
          <Field label="CTA Text" value={(b.ctaText as string) || ''} onChange={(v) => onUpdate({ ctaText: v || undefined } as Partial<Block>)} />
          <Field label="CTA URL" value={(b.ctaUrl as string) || ''} onChange={(v) => onUpdate({ ctaUrl: v || undefined } as Partial<Block>)} />
          <div className="grid grid-cols-3 gap-2">
            <ColorField label="Background" value={(b.backgroundColor as string) || ''} onChange={(v) => onUpdate({ backgroundColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Text" value={(b.textColor as string) || ''} onChange={(v) => onUpdate({ textColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Accent" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v || undefined } as Partial<Block>)} />
          </div>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">contact_mail</span>
              Contact Info
            </summary>
            <div className="pt-3 space-y-2">
              <Field label="Address" value={(b.contactInfo as Record<string,string>)?.address || ''} onChange={(v) => onUpdate({ contactInfo: { ...((b.contactInfo as Record<string,string>) || {}), address: v || undefined } } as Partial<Block>)} />
              <Field label="Phone" value={(b.contactInfo as Record<string,string>)?.phone || ''} onChange={(v) => onUpdate({ contactInfo: { ...((b.contactInfo as Record<string,string>) || {}), phone: v || undefined } } as Partial<Block>)} />
              <Field label="Email" value={(b.contactInfo as Record<string,string>)?.email || ''} onChange={(v) => onUpdate({ contactInfo: { ...((b.contactInfo as Record<string,string>) || {}), email: v || undefined } } as Partial<Block>)} />
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">link</span>
              Link Groups ({((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []).length})
            </summary>
            <div className="pt-3 space-y-2">
              {((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []).map((group, gi) => (
                <div key={gi} className="space-y-1 p-2 rounded border border-border">
                  <input type="text" value={group.label} onChange={(e) => { const next = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; next[gi] = { ...next[gi], label: e.target.value }; onUpdate({ linkGroups: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Group label (e.g. PRODUCT)" />
                  {(group.links || []).map((link, li) => (
                    <div key={li} className="flex gap-1">
                      <input type="text" value={link.label} onChange={(e) => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; const links = [...(groups[gi].links || [])]; links[li] = { ...links[li], label: e.target.value }; groups[gi] = { ...groups[gi], links }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Link label" />
                      <input type="text" value={link.href} onChange={(e) => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; const links = [...(groups[gi].links || [])]; links[li] = { ...links[li], href: e.target.value }; groups[gi] = { ...groups[gi], links }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="/path" />
                      <button type="button" onClick={() => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; groups[gi] = { ...groups[gi], links: (groups[gi].links || []).filter((_, j) => j !== li) }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="px-2 text-xs text-destructive hover:underline">x</button>
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; groups[gi] = { ...groups[gi], links: [...(groups[gi].links || []), { label: '', href: '' }] }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="flex-1 text-xs text-muted-foreground hover:underline">+ Link</button>
                    <button type="button" onClick={() => onUpdate({ linkGroups: ((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []).filter((_, j) => j !== gi) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove group</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => onUpdate({ linkGroups: [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []), { label: '', links: [] }] } as Partial<Block>)} className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50">+ Add Group</button>
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">share</span>
              Social Links ({((b.socialLinks as Array<{platform: string; url: string}>) || []).length})
            </summary>
            <div className="pt-3 space-y-2">
              {((b.socialLinks as Array<{platform: string; url: string}>) || []).map((link, i) => (
                <div key={i} className="flex gap-1">
                  <input type="text" value={link.platform} onChange={(e) => { const next = [...((b.socialLinks as Array<{platform: string; url: string}>) || [])]; next[i] = { ...next[i], platform: e.target.value }; onUpdate({ socialLinks: next } as Partial<Block>); }} className="w-24 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="platform" />
                  <input type="url" value={link.url} onChange={(e) => { const next = [...((b.socialLinks as Array<{platform: string; url: string}>) || [])]; next[i] = { ...next[i], url: e.target.value }; onUpdate({ socialLinks: next } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="https://" />
                  <button type="button" onClick={() => onUpdate({ socialLinks: ((b.socialLinks as Array<{platform: string; url: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="px-2 text-xs text-destructive hover:underline">x</button>
                </div>
              ))}
              <button type="button" onClick={() => onUpdate({ socialLinks: [...((b.socialLinks as Array<{platform: string; url: string}>) || []), { platform: '', url: '' }] } as Partial<Block>)} className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50">+ Add Social Link</button>
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">copyright</span>
              Copyright &amp; Disclaimer
            </summary>
            <div className="pt-3 space-y-2">
              <Field label="Copyright" value={(b.copyright as string) || ''} onChange={(v) => onUpdate({ copyright: v || undefined } as Partial<Block>)} />
              <TextareaField label="Disclaimer" value={(b.disclaimer as string) || ''} onChange={(v) => onUpdate({ disclaimer: v || undefined } as Partial<Block>)} rows={2} />
            </div>
          </details>
        </>
      )}
    </>
  );
}
