'use client';

// Settings panels for the `team-showcase` and `team-flip-grid` block types, extracted from SectionsPanel.
import type { TeamShowcaseBlock, TeamFlipGridBlock } from '@/types/blocks';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';

export function TeamShowcaseBlockSettings({ block, onChange }: { block: TeamShowcaseBlock; onChange: (updates: Partial<TeamShowcaseBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. OUR TEAM"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Bio Panel Color</label>
          <TokenColorPicker value={block.bioPanelColor || ''} onChange={(color) => onChange({ bioPanelColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
          <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Photo Filter (CSS)</label>
        <input
          type="text"
          value={block.photoFilter || ''}
          onChange={(e) => onChange({ photoFilter: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. sepia(0.08)"
        />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Members</label>
        {(block.members || []).map((member, i) => (
          <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={member.name}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], name: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Name"
            />
            <input
              type="text"
              value={member.title}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Title"
            />
            <input
              type="text"
              value={member.credentials || ''}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], credentials: e.target.value || undefined };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Credentials (optional)"
            />
            <input
              type="url"
              value={member.photo}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], photo: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Photo URL"
            />
            <textarea
              value={member.bio}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], bio: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Bio"
              rows={3}
            />
            <input
              type="text"
              value={(member.specialties || []).join(', ')}
              onChange={(e) => {
                const next = [...(block.members || [])];
                const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                next[i] = { ...next[i], specialties: list.length ? list : undefined };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Specialties (comma-separated, optional)"
            />
            <button
              type="button"
              onClick={() => onChange({ members: (block.members || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ members: [...(block.members || []), { id: `member-${Date.now()}`, name: '', title: '', photo: '', bio: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Member
        </button>
      </div>
    </div>
  );
}

export function TeamFlipGridBlockSettings({ block, onChange }: { block: TeamFlipGridBlock; onChange: (updates: Partial<TeamFlipGridBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. MEET THE TEAM"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 4}
          onChange={(e) => onChange({ columns: Number(e.target.value) as TeamFlipGridBlock['columns'] })}
          className={inputClass}
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Back BG Color</label>
          <TokenColorPicker value={block.backBgColor || ''} onChange={(color) => onChange({ backBgColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Back Text Color</label>
          <TokenColorPicker value={block.backTextColor || ''} onChange={(color) => onChange({ backTextColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Name Color</label>
          <TokenColorPicker value={block.nameColor || ''} onChange={(color) => onChange({ nameColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Title Color</label>
          <TokenColorPicker value={block.titleColor || ''} onChange={(color) => onChange({ titleColor: color || undefined })} />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Members</label>
        {(block.members || []).map((member, i) => (
          <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={member.name}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], name: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Name"
            />
            <input
              type="text"
              value={member.title}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Title"
            />
            <input
              type="url"
              value={member.photo}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], photo: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Photo URL"
            />
            <textarea
              value={member.bio}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], bio: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Bio (front)"
              rows={2}
            />
            <input
              type="text"
              value={member.question}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], question: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Question (back)"
            />
            <textarea
              value={member.answer}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], answer: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Answer (back)"
              rows={2}
            />
            <button
              type="button"
              onClick={() => onChange({ members: (block.members || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ members: [...(block.members || []), { id: `tmember-${Date.now()}`, name: '', title: '', bio: '', photo: '', question: '', answer: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Member
        </button>
      </div>
    </div>
  );
}
