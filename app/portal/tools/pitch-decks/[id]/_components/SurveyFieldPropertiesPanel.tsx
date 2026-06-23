/** Right-rail editor for a single survey question. Writes back to the survey record (source of truth). */
'use client';

export interface SurveyFieldForPanel {
  id: string;
  type: string;
  label: string;
  required: boolean;
  options: string[];
  placeholder?: string;
  helpText?: string;
  min?: number;
  max?: number;
  step?: number;
}

const SURVEY_FIELD_TYPES = [
  { value: 'text', label: 'Short Text', icon: 'short_text' },
  { value: 'textarea', label: 'Long Text', icon: 'notes' },
  { value: 'email', label: 'Email', icon: 'email' },
  { value: 'phone', label: 'Phone', icon: 'phone' },
  { value: 'url', label: 'URL', icon: 'link' },
  { value: 'number', label: 'Number', icon: 'tag' },
  { value: 'date', label: 'Date', icon: 'calendar_today' },
  { value: 'select', label: 'Dropdown', icon: 'arrow_drop_down_circle' },
  { value: 'radio', label: 'Single Choice', icon: 'radio_button_checked' },
  { value: 'checkbox', label: 'Multi Choice', icon: 'check_box' },
  { value: 'toggle', label: 'Toggle', icon: 'toggle_on' },
  { value: 'rating', label: 'Rating', icon: 'star' },
  { value: 'slider', label: 'Slider', icon: 'tune' },
  { value: 'heading', label: 'Heading', icon: 'title' },
];

const HAS_OPTIONS = ['select', 'radio', 'checkbox'];
const HAS_RANGE = ['slider', 'number', 'rating'];

export function SurveyFieldPropertiesPanel({ field, surveyId: _surveyId, onUpdate }: {
  field: SurveyFieldForPanel;
  surveyId: number;
  onUpdate: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="material-icons text-base text-emerald-500">quiz</span>
        <span className="text-sm font-semibold text-foreground">Question Settings</span>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Question Label</label>
        <input
          type="text"
          value={field.label || ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Field Type</label>
        <select
          value={field.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {SURVEY_FIELD_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">Required</label>
        <button
          type="button"
          onClick={() => onUpdate({ required: !field.required })}
          className={`relative w-9 h-5 rounded-full transition-colors ${field.required ? 'bg-primary' : 'bg-muted'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${field.required ? 'translate-x-4' : ''}`} />
        </button>
      </div>

      {field.type !== 'heading' && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Placeholder</label>
          <input
            type="text"
            value={field.placeholder || ''}
            onChange={(e) => onUpdate({ placeholder: e.target.value })}
            className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Enter placeholder text..."
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Help Text</label>
        <input
          type="text"
          value={field.helpText || ''}
          onChange={(e) => onUpdate({ helpText: e.target.value })}
          className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Optional help text..."
        />
      </div>

      {HAS_OPTIONS.includes(field.type) && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Options</label>
          <div className="space-y-1.5">
            {(field.options || []).map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-muted-foreground/50 w-4 text-right shrink-0">{i + 1}</span>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...(field.options || [])];
                    newOpts[i] = e.target.value;
                    onUpdate({ options: newOpts });
                  }}
                  className="flex-1 px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newOpts = (field.options || []).filter((_, j) => j !== i);
                    onUpdate({ options: newOpts });
                  }}
                  className="p-0.5 text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
                >
                  <span className="material-icons text-sm">close</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onUpdate({ options: [...(field.options || []), `Option ${(field.options || []).length + 1}`] })}
              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 border border-dashed border-border rounded text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <span className="material-icons text-sm">add</span>
              Add Option
            </button>
          </div>
        </div>
      )}

      {HAS_RANGE.includes(field.type) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Min</label>
            <input
              type="number"
              value={field.min ?? (field.type === 'rating' ? 1 : 0)}
              onChange={(e) => onUpdate({ min: Number(e.target.value) })}
              className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Max</label>
            <input
              type="number"
              value={field.max ?? (field.type === 'rating' ? 5 : 100)}
              onChange={(e) => onUpdate({ max: Number(e.target.value) })}
              className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Step</label>
            <input
              type="number"
              value={field.step ?? 1}
              onChange={(e) => onUpdate({ step: Number(e.target.value) })}
              className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      )}

      <div className="bg-accent/30 rounded-lg p-2.5 mt-4">
        <div className="flex items-start gap-1.5">
          <span className="material-icons text-xs text-emerald-500 mt-0.5">sync</span>
          <p className="text-[10px] text-muted-foreground">
            Changes sync to the survey record automatically. The survey is the source of truth.
          </p>
        </div>
      </div>
    </div>
  );
}
