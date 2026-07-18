/**
 * Inline `@name` rendering inside comment bodies.
 *
 * Mention markup convention (shared by ComposeBox + this parser):
 *
 *   "@[Display Name](userId)"
 *
 * Round-trip example — a body that contains
 *
 *   "Hey @[Dan Coyle](42), can you review @[Tina Fey](7)?"
 *
 * is parsed into a sequence of plain-text and mention tokens. The mention
 * token renders a styled chip; the plain-text token renders verbatim.
 */

'use client';

import { Fragment, type JSX } from 'react';

const MENTION_RE = /@\[([^\]]+)\]\((\d+)\)/g;

export interface MentionToken {
  kind: 'mention';
  display: string;
  userId: number;
}
export interface TextToken {
  kind: 'text';
  text: string;
}
export type CommentBodyToken = MentionToken | TextToken;

/**
 * Tokenize a stored comment body. Pure / does no DOM work — safe to call
 * during render or in tests.
 */
export function tokenizeCommentBody(body: string): CommentBodyToken[] {
  if (!body) return [];
  const out: CommentBodyToken[] = [];
  let cursor = 0;
  // Reset regex state each call (we use the global flag).
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) {
    if (m.index > cursor) {
      out.push({ kind: 'text', text: body.slice(cursor, m.index) });
    }
    out.push({
      kind: 'mention',
      display: m[1],
      userId: Number.parseInt(m[2], 10),
    });
    cursor = m.index + m[0].length;
  }
  if (cursor < body.length) {
    out.push({ kind: 'text', text: body.slice(cursor) });
  }
  return out;
}

/** Build a stored body string from a list of tokens. */
export function stringifyCommentBody(tokens: CommentBodyToken[]): string {
  return tokens
    .map((t) =>
      t.kind === 'text' ? t.text : `@[${t.display}](${t.userId})`
    )
    .join('');
}

/** Render a single mention as a styled chip. */
export function MentionPill({
  display,
  userId,
}: {
  display: string;
  userId: number;
}): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-blue-700 text-[0.92em] font-medium align-baseline"
      data-user-id={userId}
    >
      <span className="material-icons" style={{ fontSize: '12px' }}>
        alternate_email
      </span>
      <span>{display}</span>
    </span>
  );
}

/**
 * Render a stored body string with mentions as MentionPill chips and
 * everything else as plain text. Preserves newlines via `whitespace-pre-wrap`.
 */
export function CommentBodyRenderer({
  body,
}: {
  body: string;
}): JSX.Element {
  const tokens = tokenizeCommentBody(body);
  return (
    <span className="whitespace-pre-wrap break-words">
      {tokens.map((t, i) =>
        t.kind === 'mention' ? (
          <MentionPill
            key={`m-${i}`}
            display={t.display}
            userId={t.userId}
          />
        ) : (
          <Fragment key={`t-${i}`}>{t.text}</Fragment>
        )
      )}
    </span>
  );
}
