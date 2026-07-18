'use client';

/**
 * EditTab — title/description form + question list editor + save row.
 *
 * Wraps the page-local QuestionList (which today fronts SurveyBuilder).
 * Behavior is preserved 1:1 from the pre-refactor page.tsx.
 */

import type { SurveyField } from '@/components/admin/SurveyBuilder';
import QuestionList from './QuestionList';

interface Props {
  saving: boolean;
  editTitle: string;
  setEditTitle: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editFields: SurveyField[];
  setEditFields: (fields: SurveyField[]) => void;
  onSave: () => void;
}

export default function EditTab(props: Props) {
  const { saving, editTitle, setEditTitle, editDescription, setEditDescription, editFields, setEditFields, onSave } =
    props;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Title</label>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Description</label>
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="material-icons text-primary">quiz</span>
          Questions
        </h3>
        <QuestionList fields={editFields} onChange={setEditFields} />
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <span className="material-icons text-lg animate-spin">progress_activity</span>Saving...
            </>
          ) : (
            <>
              <span className="material-icons text-lg">save</span>Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
