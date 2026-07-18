'use client';

import { SurveyBlock } from '@/types/blocks';

interface SurveyBlockPreviewProps {
  block: SurveyBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SurveyBlock>) => void;
}

export function SurveyBlockPreview({ block, isSelected, onChange }: SurveyBlockPreviewProps) {
  return (
    <div className="py-8 px-6">
      {(block.title || isSelected) && (
        <input
          type="text"
          value={block.title || ''}
          onChange={(e) => onChange({ title: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="font-heading text-3xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-foreground"
          placeholder="Take Our Survey"
        />
      )}
      {(block.description || isSelected) && (
        <input
          type="text"
          value={block.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="text-lg mb-6 w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 text-muted-foreground"
          placeholder="We'd love to hear your feedback"
        />
      )}

      <div className="border rounded-lg bg-card overflow-hidden p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-icons text-primary">assignment</span>
          <span className="font-semibold text-lg">{block.slug || 'survey-form'}</span>
        </div>

        {/* Placeholder survey fields */}
        <div className="space-y-5">
          {/* Rating */}
          <div>
            <label className="block text-sm font-medium mb-2">How would you rate your experience?</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={`material-icons text-2xl ${star <= 4 ? 'text-amber-400' : 'text-muted-foreground/30'}`}
                >
                  star
                </span>
              ))}
            </div>
          </div>

          {/* Text input */}
          <div>
            <label className="block text-sm font-medium mb-2">What did you like most?</label>
            <div className="w-full h-10 border rounded-md bg-muted/20" />
          </div>

          {/* Radio */}
          <div>
            <label className="block text-sm font-medium mb-2">Would you recommend us?</label>
            <div className="space-y-2">
              {['Definitely', 'Probably', 'Not sure'].map((opt) => (
                <div key={opt} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${opt === 'Definitely' ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  <span className="text-sm">{opt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div>
            <label className="block text-sm font-medium mb-2">Any additional comments?</label>
            <div className="w-full h-20 border rounded-md bg-muted/20" />
          </div>
        </div>

        <div className="mt-6">
          <div className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium">
            Submit
          </div>
        </div>
      </div>

      {isSelected && !block.slug && (
        <p className="text-center text-xs text-amber-500 mt-4">
          <span className="material-icons text-xs align-middle mr-1">warning</span>
          Set the survey slug in the settings panel to connect a survey.
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground mt-4 italic">
        Preview: Live survey loads from /s/{block.slug || 'your-slug'}
      </p>
    </div>
  );
}
