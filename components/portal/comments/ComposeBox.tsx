/**
 * ComposeBox — textarea with `@`-mention autocomplete.
 *
 * Mention markup stored in the body (round-tripped via MentionPill) is:
 *
 *   "@[Display Name](userId)"
 *
 * Editing UX:
 *   - Type `@` to open an autocomplete menu over the supplied member list.
 *   - Arrow keys to navigate, Enter / Tab to commit, Escape to dismiss.
 *   - Cmd/Ctrl+Enter to submit the comment.
 *   - The textarea visually shows raw markup (`@[Name](id)`) — that's fine
 *     for v1 and matches Slack/GitHub behavior in their fallback editors.
 *
 * Submit is disabled while body is empty/whitespace-only.
 */

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type JSX,
} from 'react';

export interface ComposeMember {
  id: number;
  name: string;
  avatar?: string | null;
}

export interface ComposeBoxProps {
  members: ComposeMember[];
  onSubmit: (body: string, mentionedUserIds: number[]) => Promise<void> | void;
  /** Optional initial value for editing flows (not used in v1 reply path). */
  initialValue?: string;
  placeholder?: string;
  /** Visual variant — full uses larger padding for the sidebar; compact is for inline reply. */
  variant?: 'full' | 'compact';
  /** Extra class names for the wrapper. */
  className?: string;
  /** Submit-button label override. */
  submitLabel?: string;
  /** Reset textarea on successful submit. Default true. */
  resetOnSubmit?: boolean;
  /** Optional callback on cancel; renders a Cancel button when supplied. */
  onCancel?: () => void;
  /** Auto-focus the textarea on mount. */
  autoFocus?: boolean;
}

/** Find the active `@…` token at the caret, if any. */
function findMentionAtCaret(
  text: string,
  caret: number
): { start: number; query: string } | null {
  // Walk backwards from the caret looking for `@`. Stop at whitespace or `]`.
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      // Mention requires whitespace or start-of-string before the `@` to avoid
      // matching emails like `foo@bar.com`.
      const prev = i === 0 ? ' ' : text[i - 1];
      if (/\s|[(\[]/.test(prev) || i === 0) {
        return { start: i, query: text.slice(i + 1, caret) };
      }
      return null;
    }
    if (/\s/.test(ch) || ch === ']' || ch === ')') return null;
    i--;
  }
  return null;
}

/** Extract userIds referenced via `@[Name](id)` markup. */
function extractMentionedUserIds(body: string): number[] {
  const re = /@\[[^\]]+\]\((\d+)\)/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const id = Number.parseInt(m[1], 10);
    if (Number.isFinite(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function ComposeBox(props: ComposeBoxProps): JSX.Element {
  const {
    members,
    onSubmit,
    initialValue = '',
    placeholder = 'Add a comment…',
    variant = 'full',
    className = '',
    submitLabel = 'Comment',
    resetOnSubmit = true,
    onCancel,
    autoFocus = false,
  } = props;

  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mention autocomplete state.
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const filteredMembers = useMemo(() => {
    if (mentionStart === null) return [];
    const q = mentionQuery.toLowerCase();
    if (!q) return members.slice(0, 8);
    return members
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [members, mentionStart, mentionQuery]);

  // Keep highlight in range when the filter list changes.
  useEffect(() => {
    if (highlight >= filteredMembers.length) setHighlight(0);
  }, [filteredMembers.length, highlight]);

  const updateMentionContext = useCallback(
    (text: string, caret: number) => {
      const found = findMentionAtCaret(text, caret);
      if (found) {
        setMentionStart(found.start);
        setMentionQuery(found.query);
      } else {
        setMentionStart(null);
        setMentionQuery('');
      }
    },
    []
  );

  const insertMention = useCallback(
    (member: ComposeMember) => {
      const ta = textareaRef.current;
      if (!ta || mentionStart === null) return;
      const caret = ta.selectionStart ?? value.length;
      const before = value.slice(0, mentionStart);
      const after = value.slice(caret);
      const token = `@[${member.name}](${member.id}) `;
      const next = `${before}${token}${after}`;
      setValue(next);
      setMentionStart(null);
      setMentionQuery('');
      // Restore caret position after the inserted token, async so React commits first.
      const newCaret = before.length + token.length;
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCaret, newCaret);
        }
      });
    },
    [mentionStart, value]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      setValue(next);
      const caret = e.target.selectionStart ?? next.length;
      updateMentionContext(next, caret);
    },
    [updateMentionContext]
  );

  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      updateMentionContext(ta.value, ta.selectionStart ?? ta.value.length);
    },
    [updateMentionContext]
  );

  const submit = useCallback(async () => {
    const body = value.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(body, extractMentionedUserIds(body));
      if (resetOnSubmit) setValue('');
      setMentionStart(null);
      setMentionQuery('');
    } catch (e) {
      setError((e as Error).message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }, [value, submitting, onSubmit, resetOnSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Mention navigation
      if (mentionStart !== null && filteredMembers.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlight((h) => (h + 1) % filteredMembers.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlight(
            (h) => (h - 1 + filteredMembers.length) % filteredMembers.length
          );
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          // Only intercept if we have a candidate to insert.
          const candidate = filteredMembers[highlight];
          if (candidate) {
            e.preventDefault();
            insertMention(candidate);
            return;
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMentionStart(null);
          setMentionQuery('');
          return;
        }
      }

      // Cmd/Ctrl+Enter submits.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void submit();
        return;
      }
    },
    [filteredMembers, highlight, insertMention, mentionStart, submit]
  );

  const isCompact = variant === 'compact';
  const padding = isCompact ? 'p-2' : 'p-3';
  const textareaRows = isCompact ? 2 : 3;
  const textareaPadding = isCompact ? 'p-2 text-sm' : 'p-2.5 text-sm';

  return (
    <div className={`relative ${className}`}>
      <div
        className={`rounded-md border border-border bg-background ${padding}`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={textareaRows}
          disabled={submitting}
          className={`w-full resize-none bg-transparent ${textareaPadding} focus:outline-none placeholder:text-muted-foreground/70`}
        />
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground/70">
            <kbd className="rounded border px-1 font-mono text-[10px]">
              {typeof navigator !== 'undefined' &&
              navigator.platform.toLowerCase().includes('mac')
                ? '⌘'
                : 'Ctrl'}
            </kbd>{' '}
            +{' '}
            <kbd className="rounded border px-1 font-mono text-[10px]">
              Enter
            </kbd>{' '}
            to submit
          </span>
          <div className="flex items-center gap-2">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!value.trim() || submitting}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <span
                    className="material-icons animate-spin"
                    style={{ fontSize: '14px' }}
                  >
                    progress_activity
                  </span>
                  Sending…
                </>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-1 text-xs text-red-600">{error}</div>
      ) : null}

      {mentionStart !== null && filteredMembers.length > 0 ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-background shadow-lg"
        >
          {filteredMembers.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                // mousedown so blur of textarea doesn't beat us to it
                e.preventDefault();
                insertMention(m);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                i === highlight ? 'bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              {m.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.avatar}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ComposeBox;
