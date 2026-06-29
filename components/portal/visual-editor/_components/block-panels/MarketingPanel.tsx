'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { Block } from '@/types/blocks';
import {
  Field,
  RichTextField,
  SelectField,
  ColorField,
  CheckboxField,
  NumberField,
} from '../../panel-fields';
import { ListEditor } from '../ListEditor';
import type { PanelProps } from './ContentPanel';

// ─── Marketing Panel ──────────────────────────────────────────────────────────
// stats, card-grid, flip-card-grid, metric-cards, logo-strip, services-grid,
// featured-content, bento-grid, team-showcase, team-flip-grid, testimonial

export function MarketingPanel({ block, onUpdate, siteId }: PanelProps) {
  const b = block as unknown as Record<string, unknown>;
  const uid = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';
  return (
    <>
      {block.type === 'testimonial' && (
        <>
          <RichTextField label="Quote" value={b.quote as string} onChange={(v) => onUpdate({ quote: v } as Partial<Block>)} />
          <Field label="Author" value={b.author as string} onChange={(v) => onUpdate({ author: v } as Partial<Block>)} />
          <Field label="Role" value={b.role as string} onChange={(v) => onUpdate({ role: v } as Partial<Block>)} />
          <Field label="Company" value={b.company as string} onChange={(v) => onUpdate({ company: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Avatar</span><MediaPicker value={b.avatar as string} onChange={(v) => onUpdate({ avatar: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
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
    </>
  );
}
