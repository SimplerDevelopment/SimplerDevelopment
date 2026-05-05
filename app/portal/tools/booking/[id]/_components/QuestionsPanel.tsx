/**
 * Questions tab — custom intake questions added to the booking flow.
 *
 * Each question is identified by a generated UUID; the type controls the
 * input variant (`text` | `textarea` | `select`). Select questions also
 * own an `options` string array.
 */
'use client';

import type { BookingQuestion } from '../_lib/types';

interface QuestionsPanelProps {
  questions: BookingQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<BookingQuestion[]>>;
}

export function QuestionsPanel({ questions, setQuestions }: QuestionsPanelProps) {
  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: '', type: 'text', required: false },
    ]);
  }

  function updateQuestion(qId: string, field: keyof BookingQuestion, value: unknown) {
    setQuestions((prev) => prev.map((q) => (q.id === qId ? { ...q, [field]: value } : q)));
  }

  function removeQuestion(qId: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
  }

  function addOption(qId: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, options: [...(q.options || []), ''] } : q)),
    );
  }

  function updateOption(qId: string, idx: number, value: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? { ...q, options: (q.options || []).map((o, i) => (i === idx ? value : o)) }
          : q,
      ),
    );
  }

  function removeOption(qId: string, idx: number) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? { ...q, options: (q.options || []).filter((_, i) => i !== idx) }
          : q,
      ),
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="material-icons text-primary">quiz</span>
          <h2 className="text-sm font-medium text-foreground">Custom Questions</h2>
        </div>
        <button
          onClick={addQuestion}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-lg">add</span>
          Add Question
        </button>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <span className="material-icons text-3xl mb-2 block">quiz</span>
          <p className="text-sm">
            No custom questions yet. Guests will only be asked for name, email, and phone.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <span className="text-xs text-muted-foreground font-medium">
                  Question {idx + 1}
                </span>
                <button
                  onClick={() => removeQuestion(q.id)}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <span className="material-icons text-lg">close</span>
                </button>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Label</label>
                <input
                  type="text"
                  value={q.label}
                  onChange={(e) => updateQuestion(q.id, 'label', e.target.value)}
                  placeholder="e.g. What would you like to discuss?"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-muted-foreground mb-1">Type</label>
                  <select
                    value={q.type}
                    onChange={(e) => updateQuestion(q.id, 'type', e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="text">Short Text</option>
                    <option value="textarea">Long Text</option>
                    <option value="select">Select</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <label className="text-xs text-muted-foreground">Required</label>
                  <button
                    type="button"
                    onClick={() => updateQuestion(q.id, 'required', !q.required)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      q.required ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        q.required ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
              {q.type === 'select' && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Options</label>
                  <div className="space-y-2">
                    {(q.options || []).map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                          placeholder={`Option ${optIdx + 1}`}
                          className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <button
                          onClick={() => removeOption(q.id, optIdx)}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <span className="material-icons text-lg">remove_circle_outline</span>
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addOption(q.id)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <span className="material-icons text-sm">add</span>
                      Add option
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
