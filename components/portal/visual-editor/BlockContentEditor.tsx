'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MediaPicker from '@/components/admin/MediaPicker';
import type { Block, ColumnsBlock } from '@/types/blocks';
import { IconPicker } from '../IconPicker';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import { HtmlRenderEditor } from './HtmlRenderEditor';
import {
  Field,
  ColorField,
  TextareaField,
  RichTextField,
  SelectField,
  CheckboxField,
  NumberField,
} from './panel-fields';
import { SurveyResultsEditor } from './_components/SurveyResultsEditor';
import { HtmlEmbedEditor } from './_components/HtmlEmbedEditor';
import { ListEditor, SortableListItem } from './_components/ListEditor';
import { ColumnsEditor } from './_components/ColumnsEditor';
import { BookingPagePicker } from './_components/pickers/BookingPagePicker';
import { SurveyPicker } from './_components/pickers/SurveyPicker';
import { ProductSlugPicker } from './_components/pickers/ProductSlugPicker';
import { MarqueeEditor } from './_components/MarqueeEditor';
import { HeroSlideshowEditor } from './_components/HeroSlideshowEditor';

// ─── Block Content Editor ────────────────────────────────────────────────────

export function BlockContentEditor({ block, onUpdate, siteId }: { block: Block; onUpdate: (updates: Partial<Block>) => void; siteId?: number }) {
  const b = block as unknown as Record<string, unknown>;
  const uid = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';

  return (
    <div className="space-y-3">
      {block.type === 'heading' && (
        <>
          <RichTextField label="Content" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} singleLine />
          <SelectField label="Level" value={String(b.level || 2)} options={['1','2','3','4','5','6']} onChange={(v) => onUpdate({ level: Number(v) } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'text' && (
        <>
          <RichTextField label="Content" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'base'} options={['sm','base','lg','xl']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'image' && (
        <>
          <div><span className="text-xs font-medium text-muted-foreground">Image</span><MediaPicker value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <Field label="Alt Text" value={b.alt as string} onChange={(v) => onUpdate({ alt: v } as Partial<Block>)} />
          <Field label="Caption" value={b.caption as string} onChange={(v) => onUpdate({ caption: v } as Partial<Block>)} />
          <SelectField label="Width" value={(b.width as string) || 'full'} options={['small','medium','large','full']} onChange={(v) => onUpdate({ width: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'button' && (
        <>
          <Field label="Text" value={b.text as string} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <Field label="URL" value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
          <SelectField label="Variant" value={(b.variant as string) || 'primary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <CheckboxField label="Open in new tab" checked={b.openInNewTab as boolean} onChange={(v) => onUpdate({ openInNewTab: v } as Partial<Block>)} />
          <Field label="Icon (Material Icon name)" value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v || undefined } as Partial<Block>)} />
          <div>
            <span className="text-xs font-medium text-muted-foreground">Icon Position</span>
            <select
              value={(b.iconPosition as string) || 'left'}
              onChange={(e) => onUpdate({ iconPosition: e.target.value } as Partial<Block>)}
              disabled={!(b.icon as string)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground mt-1"
            >
              <option value="left">Left of text</option>
              <option value="right">Right of text</option>
            </select>
          </div>
          <SelectField label="Hover Effect" value={(b.hoverEffect as string) || 'none'} options={['none','lift','glow','fill','slide','pulse']} onChange={(v) => onUpdate({ hoverEffect: v } as Partial<Block>)} />
          <div>
            <Field label="Brand Preset (optional)" value={(b.presetId as string) || ''} onChange={(v) => onUpdate({ presetId: v || undefined } as Partial<Block>)} />
            <p className="text-xs text-muted-foreground mt-0.5">Preset key from brand presets. Preset styles apply first, block styles override on top.</p>
          </div>
        </>
      )}
      {block.type === 'quote' && (
        <>
          <RichTextField label="Quote" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
          <Field label="Author" value={b.author as string} onChange={(v) => onUpdate({ author: v } as Partial<Block>)} />
          <Field label="Citation" value={b.citation as string} onChange={(v) => onUpdate({ citation: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'code' && (
        <>
          <TextareaField label="Code" value={b.code as string} onChange={(v) => onUpdate({ code: v } as Partial<Block>)} rows={6} />
          <Field label="Language" value={b.language as string} onChange={(v) => onUpdate({ language: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'spacer' && (
        <SelectField label="Height" value={(b.height as string) || 'md'} options={['sm','md','lg','xl']} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
      )}
      {block.type === 'divider' && (
        <SelectField label="Line Style" value={(b.lineStyle as string) || 'solid'} options={['solid','dashed','dotted']} onChange={(v) => onUpdate({ lineStyle: v } as Partial<Block>)} />
      )}
      {block.type === 'youtube' && (
        <>
          <Field label="URL" value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
          <Field label="Caption" value={b.caption as string} onChange={(v) => onUpdate({ caption: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'video' && (
        <>
          <div><span className="text-xs font-medium text-muted-foreground">Video</span><MediaPicker value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} mimeTypeFilter="video" label="" apiEndpoint={mediaApi} /></div>
          <Field label="Caption" value={b.caption as string} onChange={(v) => onUpdate({ caption: v } as Partial<Block>)} />
          <CheckboxField label="Autoplay" checked={b.autoplay as boolean} onChange={(v) => onUpdate({ autoplay: v } as Partial<Block>)} />
          <CheckboxField label="Show Controls" checked={b.controls as boolean ?? true} onChange={(v) => onUpdate({ controls: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'hero' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="CTA Text" value={b.ctaText as string} onChange={(v) => onUpdate({ ctaText: v } as Partial<Block>)} />
          <Field label="CTA Link" value={b.ctaLink as string} onChange={(v) => onUpdate({ ctaLink: v } as Partial<Block>)} />
          <Field label="2nd CTA Text" value={b.secondaryCtaText as string} onChange={(v) => onUpdate({ secondaryCtaText: v } as Partial<Block>)} />
          <Field label="2nd CTA Link" value={b.secondaryCtaLink as string} onChange={(v) => onUpdate({ secondaryCtaLink: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <div><span className="text-xs font-medium text-muted-foreground">Background Video</span><MediaPicker value={b.backgroundVideo as string} onChange={(v) => onUpdate({ backgroundVideo: v } as Partial<Block>)} mimeTypeFilter="video" label="" apiEndpoint={mediaApi} /></div>
        </>
      )}
      {block.type === 'marquee' && (
        <MarqueeEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}
      {block.type === 'hero-slideshow' && (
        <HeroSlideshowEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}
      {block.type === 'cta' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.primaryButtonText as string} onChange={(v) => onUpdate({ primaryButtonText: v } as Partial<Block>)} />
          <Field label="Button URL" value={b.primaryButtonUrl as string} onChange={(v) => onUpdate({ primaryButtonUrl: v } as Partial<Block>)} />
          <Field label="2nd Button Text" value={b.secondaryButtonText as string} onChange={(v) => onUpdate({ secondaryButtonText: v } as Partial<Block>)} />
          <Field label="2nd Button URL" value={b.secondaryButtonUrl as string} onChange={(v) => onUpdate({ secondaryButtonUrl: v } as Partial<Block>)} />
          <SelectField label="Background" value={(b.backgroundStyle as string) || 'none'} options={['none','solid','gradient']} onChange={(v) => onUpdate({ backgroundStyle: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'testimonial' && (
        <>
          <RichTextField label="Quote" value={b.quote as string} onChange={(v) => onUpdate({ quote: v } as Partial<Block>)} />
          <Field label="Author" value={b.author as string} onChange={(v) => onUpdate({ author: v } as Partial<Block>)} />
          <Field label="Role" value={b.role as string} onChange={(v) => onUpdate({ role: v } as Partial<Block>)} />
          <Field label="Company" value={b.company as string} onChange={(v) => onUpdate({ company: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Avatar</span><MediaPicker value={b.avatar as string} onChange={(v) => onUpdate({ avatar: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
        </>
      )}
      {block.type === 'columns' && (
        <ColumnsEditor block={block} onUpdate={onUpdate} />
      )}
      {block.type === 'section' && (
        <>
          <ColorField label="Background Color" value={(b.backgroundColor as string) || ''} onChange={(v) => onUpdate({ backgroundColor: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <Field label="Max Width" value={b.maxWidth as string} onChange={(v) => onUpdate({ maxWidth: v } as Partial<Block>)} />
          <ColorField label="Text Color" value={(b.color as string) || ''} onChange={(v) => onUpdate({ color: v } as Partial<Block>)} />
          <div>
            <span className="text-xs font-medium text-muted-foreground">Font Family</span>
            <GoogleFontPicker value={(b.fontFamily as string) || ''} onChange={(v) => onUpdate({ fontFamily: v } as Partial<Block>)} />
          </div>
          <SelectField label="HTML Tag" value={(b.htmlTag as string) || 'section'} options={['section','div','article','aside','header','footer']} onChange={(v) => onUpdate({ htmlTag: v } as Partial<Block>)} />
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">call_split</span>
              Diagonal Split (advanced)
            </summary>
            <div className="pt-3 space-y-3">
              <p className="text-xs text-muted-foreground">Optional second-color overlay rendered with a clip-path. Leave blank to disable.</p>
              <ColorField label="Split Color" value={(b.splitColor as string) || ''} onChange={(v) => onUpdate({ splitColor: v || undefined } as Partial<Block>)} />
              <div>
                <span className="text-xs font-medium text-muted-foreground">Clip Path</span>
                <input
                  type="text"
                  value={(b.splitClipPath as string) || ''}
                  onChange={(e) => onUpdate({ splitClipPath: e.target.value || undefined } as Partial<Block>)}
                  placeholder="polygon(55% 0, 100% 0, 100% 100%, 45% 100%)"
                  className="w-full text-xs font-mono rounded border border-border bg-background px-2 py-1.5 text-foreground mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">Defaults to a right-side diagonal when Split Color is set.</p>
              </div>
            </div>
          </details>
          <p className="text-xs text-muted-foreground mt-2">Nested blocks: {block.blocks.length}. Edit via layers panel.</p>
        </>
      )}

      {/* ── Stats Block — with item editor ── */}
      {block.type === 'stats' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <ListEditor
            label="Stats"
            items={(block.stats || []).map(s => ({ id: s.id, fields: { value: s.value, label: s.label } }))}
            fieldDefs={[{ name: 'value', label: 'Value', placeholder: '100+' }, { name: 'label', label: 'Label', placeholder: 'Clients' }]}
            onAdd={() => onUpdate({ stats: [...(block.stats || []), { id: uid(), value: '0', label: 'New stat' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ stats: block.stats.filter(s => s.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ stats: block.stats.map(s => s.id === id ? { ...s, [field]: value } : s) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ stats: ids.map(id => block.stats.find(s => s.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Card Grid Block — with card editor ── */}
      {block.type === 'card-grid' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <NumberField label="Icon Size (px)" value={Number(b.iconSize) || 24} onChange={(v) => onUpdate({ iconSize: String(v) } as Partial<Block>)} min={12} max={128} />
          <ListEditor
            label="Cards"
            items={(block.cards || []).map(c => ({ id: c.id, fields: { title: c.title, description: c.description, icon: c.icon || '', image: c.image || '', link: c.link || '' } }))}
            fieldDefs={[
              { name: 'title', label: 'Title', placeholder: 'Card title' },
              { name: 'description', label: 'Description', placeholder: 'Card description', multiline: true },
              { name: 'icon', label: 'Icon', type: 'icon' as const },
              { name: 'image', label: 'Image', type: 'image' as const },
              { name: 'link', label: 'Link', placeholder: 'https://...' },
            ]}
            onAdd={() => onUpdate({ cards: [...(block.cards || []), { id: uid(), title: 'New card', description: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ cards: block.cards.filter(c => c.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ cards: block.cards.map(c => c.id === id ? { ...c, [field]: value } : c) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ cards: ids.map(id => block.cards.find(c => c.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Flip Card Grid Block ── */}
      {block.type === 'flip-card-grid' && (
        <>
          <RichTextField label="Overline" value={b.overline as string} onChange={(v) => onUpdate({ overline: v } as Partial<Block>)} singleLine />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <SelectField label="Flip Trigger" value={(b.flipTrigger as string) || 'hover'} options={['hover','click']} onChange={(v) => onUpdate({ flipTrigger: v } as Partial<Block>)} />
          <SelectField label="Flip Axis" value={(b.flipAxis as string) || 'horizontal'} options={['horizontal','vertical']} onChange={(v) => onUpdate({ flipAxis: v } as Partial<Block>)} />
          <Field label="Card Height" value={(b.cardHeight as string) || '280px'} onChange={(v) => onUpdate({ cardHeight: v } as Partial<Block>)} />
          <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
          <ListEditor
            label="Cards"
            items={(block.cards || []).map(c => ({ id: c.id, fields: { frontTitle: c.frontTitle, frontSubtitle: c.frontSubtitle || '', frontIcon: c.frontIcon || '', frontImage: c.frontImage || '', backText: c.backText, backLink: c.backLink || '', backLinkText: c.backLinkText || '' } }))}
            fieldDefs={[
              { name: 'frontTitle', label: 'Front Title', placeholder: 'Card title' },
              { name: 'frontSubtitle', label: 'Front Subtitle', placeholder: 'Optional subtitle' },
              { name: 'frontIcon', label: 'Front Icon', type: 'icon' as const },
              { name: 'frontImage', label: 'Front Image', type: 'image' as const },
              { name: 'backText', label: 'Back Text', placeholder: 'Revealed when flipped', multiline: true },
              { name: 'backLink', label: 'Back Link URL', placeholder: 'https://…' },
              { name: 'backLinkText', label: 'Back Link Text', placeholder: 'Learn More' },
            ]}
            onAdd={() => onUpdate({ cards: [...(block.cards || []), { id: uid(), frontTitle: 'New Card', backText: 'Back side content' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ cards: block.cards.filter(c => c.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ cards: block.cards.map(c => c.id === id ? { ...c, [field]: value } : c) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ cards: ids.map(id => block.cards.find(c => c.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Metric Cards Block — case-study-style ── */}
      {block.type === 'metric-cards' && (
        <>
          <RichTextField label="Overline" value={b.overline as string} onChange={(v) => onUpdate({ overline: v } as Partial<Block>)} singleLine />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 4)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
          <Field label="Logo Column Width" value={(b.logoColumnWidth as string) || ''} onChange={(v) => onUpdate({ logoColumnWidth: v || undefined } as Partial<Block>)} />
          <Field label="Label Max Width" value={(b.labelMaxWidth as string) || ''} onChange={(v) => onUpdate({ labelMaxWidth: v || undefined } as Partial<Block>)} />
          <ListEditor
            label="Metrics"
            items={(block.metrics || []).map(m => ({ id: m.id, fields: { value: m.value, label: m.label, institution: m.institution || '', institutionLogo: m.institutionLogo || '', link: m.link || '', linkText: m.linkText || '' } }))}
            fieldDefs={[
              { name: 'value', label: 'Metric Value', placeholder: '83%' },
              { name: 'label', label: 'Label', placeholder: 'Increase in Readmit Completions', multiline: true },
              { name: 'institution', label: 'Institution', placeholder: 'William Peace University' },
              { name: 'institutionLogo', label: 'Institution Logo', type: 'image' as const },
              { name: 'link', label: 'Link URL', placeholder: 'https://…' },
              { name: 'linkText', label: 'Link Text', placeholder: 'Case Study' },
            ]}
            onAdd={() => onUpdate({ metrics: [...(block.metrics || []), { id: uid(), value: '100%', label: 'Metric Label' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ metrics: block.metrics.filter(m => m.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ metrics: block.metrics.map(m => m.id === id ? { ...m, [field]: value } : m) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ metrics: ids.map(id => block.metrics.find(m => m.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Logo Strip Block ── */}
      {block.type === 'logo-strip' && (
        <>
          <RichTextField label="Overline" value={b.overline as string} onChange={(v) => onUpdate({ overline: v } as Partial<Block>)} singleLine />
          <SelectField label="Columns" value={String(b.columns || 6)} options={['3','4','5','6','7','8']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <Field label="Logo Height" value={(b.logoHeight as string) || '40px'} onChange={(v) => onUpdate({ logoHeight: v } as Partial<Block>)} />
          <SelectField label="Gap" value={(b.gap as string) || 'lg'} options={['sm','md','lg']} onChange={(v) => onUpdate({ gap: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <CheckboxField label="Grayscale (color on hover)" checked={b.grayscale as boolean ?? true} onChange={(v) => onUpdate({ grayscale: v } as Partial<Block>)} />
          <ListEditor
            label="Logos"
            items={(block.logos || []).map(l => ({ id: l.id, fields: { imageUrl: l.imageUrl, alt: l.alt, link: l.link || '' } }))}
            fieldDefs={[
              { name: 'imageUrl', label: 'Logo Image', type: 'image' as const },
              { name: 'alt', label: 'Alt Text', placeholder: 'Company name' },
              { name: 'link', label: 'Link URL', placeholder: 'https://…' },
            ]}
            onAdd={() => onUpdate({ logos: [...(block.logos || []), { id: uid(), imageUrl: '', alt: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ logos: block.logos.filter(l => l.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ logos: block.logos.map(l => l.id === id ? { ...l, [field]: value } : l) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ logos: ids.map(id => block.logos.find(l => l.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Gallery Block — with image editor ── */}
      {block.type === 'gallery' && (
        <>
          <SelectField label="Layout" value={(b.layout as string) || 'grid'} options={['grid','masonry']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <CheckboxField label="Enable Lightbox" checked={b.lightbox as boolean} onChange={(v) => onUpdate({ lightbox: v } as Partial<Block>)} />
          <ListEditor
            label="Images"
            items={(block.images || []).map(img => ({ id: img.id, fields: { url: img.url, alt: img.alt, caption: img.caption || '' } }))}
            fieldDefs={[
              { name: 'url', label: 'Image', type: 'image' as const },
              { name: 'alt', label: 'Alt', placeholder: 'Image description' },
              { name: 'caption', label: 'Caption', placeholder: 'Optional caption' },
            ]}
            onAdd={() => onUpdate({ images: [...(block.images || []), { id: uid(), url: '', alt: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ images: block.images.filter(i => i.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ images: block.images.map(i => i.id === id ? { ...i, [field]: value } : i) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ images: ids.map(id => block.images.find(i => i.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Services Grid Block — with service editor ── */}
      {block.type === 'services-grid' && (
        <>
          <RichTextField label="Overline" value={b.overline as string} onChange={(v) => onUpdate({ overline: v } as Partial<Block>)} singleLine />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
          <ListEditor
            label="Services"
            items={(block.services || []).map(s => ({ id: s.id, fields: { title: s.title, description: s.description, icon: s.icon || '', link: s.link || '', linkText: s.linkText || '' } }))}
            fieldDefs={[
              { name: 'title', label: 'Title', placeholder: 'Service name' },
              { name: 'description', label: 'Description', placeholder: 'Service description', multiline: true },
              { name: 'icon', label: 'Icon', type: 'icon' as const },
              { name: 'link', label: 'Link URL', placeholder: 'https://...' },
              { name: 'linkText', label: 'Link Text', placeholder: 'Learn More' },
            ]}
            onAdd={() => onUpdate({ services: [...(block.services || []), { id: uid(), title: 'New service', description: '', bullets: [] }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ services: block.services.filter(s => s.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ services: block.services.map(s => s.id === id ? { ...s, [field]: value } : s) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ services: ids.map(id => block.services.find(s => s.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
          {/* Per-service bullets editor — one ListEditor per service since bullets
              are nested arrays and the generic ListEditor doesn't handle nested lists. */}
          {(block.services || []).length > 0 && (
            <div className="space-y-3 border border-border rounded p-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bullets per service</div>
              {(block.services || []).map((service) => (
                <div key={`bullets-${service.id}`} className="space-y-1.5">
                  <div className="text-[11px] font-medium text-foreground">{service.title || 'Untitled service'}</div>
                  <ListEditor
                    label="Bullets"
                    items={(service.bullets || []).map(bl => ({ id: bl.id, fields: { text: bl.text, icon: bl.icon || '' } }))}
                    fieldDefs={[
                      { name: 'text', label: 'Text', placeholder: 'Benefit or feature' },
                      { name: 'icon', label: 'Icon', type: 'icon' as const },
                    ]}
                    onAdd={() => onUpdate({ services: block.services.map(s => s.id === service.id ? { ...s, bullets: [...(s.bullets || []), { id: uid(), text: 'New bullet', icon: 'check_circle' }] } : s) } as Partial<Block>)}
                    onRemove={(bid) => onUpdate({ services: block.services.map(s => s.id === service.id ? { ...s, bullets: (s.bullets || []).filter(bl => bl.id !== bid) } : s) } as Partial<Block>)}
                    onItemChange={(bid, field, value) => onUpdate({ services: block.services.map(s => s.id === service.id ? { ...s, bullets: (s.bullets || []).map(bl => bl.id === bid ? { ...bl, [field]: value } : bl) } : s) } as Partial<Block>)}
                    onReorder={(bids) => onUpdate({ services: block.services.map(s => s.id === service.id ? { ...s, bullets: bids.map(bid => (s.bullets || []).find(bl => bl.id === bid)!).filter(Boolean) } : s) } as Partial<Block>)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

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

      {/* ── Featured Content Block ── */}
      {block.type === 'featured-content' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Image</span><MediaPicker value={b.imageUrl as string} onChange={(v) => onUpdate({ imageUrl: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <SelectField label="Image Position" value={(b.imagePosition as string) || 'right'} options={['left','right']} onChange={(v) => onUpdate({ imagePosition: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
          <Field label="Button URL" value={b.buttonUrl as string} onChange={(v) => onUpdate({ buttonUrl: v } as Partial<Block>)} />
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

      {/* ── Product Grid Block ── */}
      {block.type === 'product-grid' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Category Slug" value={b.categorySlug as string} onChange={(v) => onUpdate({ categorySlug: v } as Partial<Block>)} />
          <SelectField label="Sort" value={(b.sort as string) || 'newest'} options={['newest','price_asc','price_desc','featured']} onChange={(v) => onUpdate({ sort: v } as Partial<Block>)} />
          <SelectField label="Limit" value={String(b.limit || 6)} options={['3','6','9','12']} onChange={(v) => onUpdate({ limit: Number(v) } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <CheckboxField label="Show Price" checked={b.showPrice as boolean ?? true} onChange={(v) => onUpdate({ showPrice: v } as Partial<Block>)} />
          <CheckboxField label="Show Description" checked={b.showDescription as boolean} onChange={(v) => onUpdate({ showDescription: v } as Partial<Block>)} />
          <CheckboxField label="Show Category" checked={b.showCategory as boolean} onChange={(v) => onUpdate({ showCategory: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Featured Products Block ── */}
      {block.type === 'featured-products' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Limit" value={String(b.limit || 4)} options={['2','3','4','6','8']} onChange={(v) => onUpdate({ limit: Number(v) } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 4)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <SelectField label="Layout" value={(b.layout as string) || 'grid'} options={['grid','carousel']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <CheckboxField label="Show Price" checked={b.showPrice as boolean ?? true} onChange={(v) => onUpdate({ showPrice: v } as Partial<Block>)} />
          <CheckboxField label="Show Badge" checked={b.showBadge as boolean} onChange={(v) => onUpdate({ showBadge: v } as Partial<Block>)} />
          <Field label="Badge Text" value={b.badgeText as string} onChange={(v) => onUpdate({ badgeText: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Product Categories Block ── */}
      {block.type === 'product-categories' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <SelectField label="Layout" value={(b.layout as string) || 'grid'} options={['grid','list']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <CheckboxField label="Show Product Count" checked={b.showProductCount as boolean ?? true} onChange={(v) => onUpdate({ showProductCount: v } as Partial<Block>)} />
          <CheckboxField label="Show Image" checked={b.showImage as boolean ?? true} onChange={(v) => onUpdate({ showImage: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Shopping Cart Block ── */}
      {block.type === 'shopping-cart' && (
        <>
          <SelectField label="Variant" value={(b.variant as string) || 'full'} options={['full','mini','icon-only']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <CheckboxField label="Show Subtotal" checked={b.showSubtotal as boolean ?? true} onChange={(v) => onUpdate({ showSubtotal: v } as Partial<Block>)} />
          <Field label="Checkout Button Text" value={b.checkoutButtonText as string} onChange={(v) => onUpdate({ checkoutButtonText: v } as Partial<Block>)} />
          <Field label="Empty Cart Message" value={b.emptyCartMessage as string} onChange={(v) => onUpdate({ emptyCartMessage: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Store Banner Block ── */}
      {block.type === 'store-banner' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <Field label="Discount Code" value={b.discountCode as string} onChange={(v) => onUpdate({ discountCode: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
          <Field label="Button URL" value={b.buttonUrl as string} onChange={(v) => onUpdate({ buttonUrl: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <SelectField label="Background Style" value={(b.backgroundStyle as string) || 'gradient'} options={['gradient','solid','image']} onChange={(v) => onUpdate({ backgroundStyle: v } as Partial<Block>)} />
          <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
          <Field label="Countdown Date" value={b.countdownDate as string} onChange={(v) => onUpdate({ countdownDate: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Product Detail Block ── */}
      {block.type === 'product-detail' && (
        <>
          <ProductSlugPicker siteId={siteId} value={b.productSlug as string} onChange={(v) => onUpdate({ productSlug: v } as Partial<Block>)} />
          <SelectField label="Layout" value={(b.layout as string) || 'standard'} options={['standard','compact','wide']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <CheckboxField label="Show Image Gallery" checked={b.showGallery !== false} onChange={(v) => onUpdate({ showGallery: v } as Partial<Block>)} />
          <CheckboxField label="Show Full Description" checked={b.showDescription !== false} onChange={(v) => onUpdate({ showDescription: v } as Partial<Block>)} />
          <CheckboxField label="Show Variant Options" checked={b.showVariants !== false} onChange={(v) => onUpdate({ showVariants: v } as Partial<Block>)} />
          <CheckboxField label="Show Add to Cart" checked={b.showAddToCart !== false} onChange={(v) => onUpdate({ showAddToCart: v } as Partial<Block>)} />
          <CheckboxField label="Show Bulk Pricing" checked={b.showBulkPricing !== false} onChange={(v) => onUpdate({ showBulkPricing: v } as Partial<Block>)} />
          <CheckboxField label="Show Breadcrumb" checked={b.showBreadcrumb !== false} onChange={(v) => onUpdate({ showBreadcrumb: v } as Partial<Block>)} />
          <CheckboxField label="Show Tags & SKU" checked={b.showTags !== false} onChange={(v) => onUpdate({ showTags: v } as Partial<Block>)} />
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

      {/* ── Bento Grid Block ── */}
      {block.type === 'bento-grid' && (
        <>
          <Field label="Overline" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <div className="grid grid-cols-3 gap-2">
            <SelectField label="Columns" value={String(b.columns || 2)} options={['1','2','3']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
            <ColorField label="Dark BG" value={(b.darkBg as string) || ''} onChange={(v) => onUpdate({ darkBg: v || undefined } as Partial<Block>)} />
            <ColorField label="Light Border" value={(b.lightBorder as string) || ''} onChange={(v) => onUpdate({ lightBorder: v || undefined } as Partial<Block>)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Cards ({((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || []).length})</span>
              <button type="button" onClick={() => onUpdate({ cards: [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || []), { id: `bento-${Date.now()}`, title: '', items: [], variant: 'dark', span: 6 }] } as Partial<Block>)} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
            </div>
            {((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || []).map((card, i) => (
              <div key={card.id ?? i} className="space-y-1 p-2 rounded border border-border">
                <input type="text" value={card.title} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], title: e.target.value }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Title" />
                <input type="text" value={card.lead || ''} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], lead: e.target.value || undefined }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground italic" placeholder="Lead/question (optional)" />
                <textarea value={(card.items || []).join('\n')} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], items: e.target.value.split('\n').map((s: string) => s.trim()).filter(Boolean) }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Bullet items (one per line)" rows={3} />
                <input type="url" value={card.link || ''} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], link: e.target.value || undefined }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Link URL (optional)" />
                <input type="text" value={card.linkText || ''} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], linkText: e.target.value || undefined }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Link text (optional)" />
                <div className="flex gap-2">
                  <select value={card.variant || 'dark'} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], variant: e.target.value }; onUpdate({ cards: next } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground">
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                  <input type="number" min={1} max={12} value={card.span ?? 6} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], span: Number(e.target.value) }; onUpdate({ cards: next } as Partial<Block>); }} className="w-20 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Span" />
                </div>
                <button type="button" onClick={() => onUpdate({ cards: ((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Team Showcase Block ── */}
      {block.type === 'team-showcase' && (
        <>
          <Field label="Overline" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Bio Panel Color" value={(b.bioPanelColor as string) || ''} onChange={(v) => onUpdate({ bioPanelColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v || undefined } as Partial<Block>)} />
          </div>
          <Field label="Photo Filter (CSS)" value={(b.photoFilter as string) || ''} onChange={(v) => onUpdate({ photoFilter: v || undefined } as Partial<Block>)} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Members ({((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || []).length})</span>
              <button type="button" onClick={() => onUpdate({ members: [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || []), { id: `member-${Date.now()}`, name: '', title: '', photo: '', bio: '' }] } as Partial<Block>)} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
            </div>
            {((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || []).map((member, i) => (
              <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
                <input type="text" value={member.name} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], name: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Name" />
                <input type="text" value={member.title} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], title: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Title" />
                <input type="text" value={member.credentials || ''} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], credentials: e.target.value || undefined }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Credentials (optional)" />
                <input type="url" value={member.photo} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], photo: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Photo URL" />
                <textarea value={member.bio} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], bio: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Bio" rows={3} />
                <input type="text" value={(member.specialties || []).join(', ')} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; const list = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean); next[i] = { ...next[i], specialties: list.length ? list : undefined }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Specialties (comma-separated, optional)" />
                <button type="button" onClick={() => onUpdate({ members: ((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Team Flip Grid Block ── */}
      {block.type === 'team-flip-grid' && (
        <>
          <Field label="Overline" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <SelectField label="Columns" value={String(b.columns || 4)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Back BG Color" value={(b.backBgColor as string) || ''} onChange={(v) => onUpdate({ backBgColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Back Text Color" value={(b.backTextColor as string) || ''} onChange={(v) => onUpdate({ backTextColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Name Color" value={(b.nameColor as string) || ''} onChange={(v) => onUpdate({ nameColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Title Color" value={(b.titleColor as string) || ''} onChange={(v) => onUpdate({ titleColor: v || undefined } as Partial<Block>)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Members ({((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || []).length})</span>
              <button type="button" onClick={() => onUpdate({ members: [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || []), { id: `tmember-${Date.now()}`, name: '', title: '', bio: '', photo: '', question: '', answer: '' }] } as Partial<Block>)} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
            </div>
            {((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || []).map((member, i) => (
              <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
                <input type="text" value={member.name} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], name: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Name" />
                <input type="text" value={member.title} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], title: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Title" />
                <input type="url" value={member.photo} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], photo: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Photo URL" />
                <textarea value={member.bio} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], bio: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Bio (front)" rows={2} />
                <input type="text" value={member.question} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], question: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Question (back)" />
                <textarea value={member.answer} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], answer: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Answer (back)" rows={2} />
                <button type="button" onClick={() => onUpdate({ members: ((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove</button>
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
    </div>
  );
}

