/**
 * PUX-126 — pure chord-matching logic for the iframe→parent undo/redo
 * forward (EditableBlockRenderer.tsx forwards IFRAME_MESSAGES.REQUEST_UNDO /
 * REQUEST_REDO instead of calling editor.undo()/redo() directly, because a
 * parent-only keydown listener never fires once browser keyboard focus moves
 * into the iframe). No DOM/React needed — `matchUndoRedoChord` takes a plain
 * object shaped like the fields of a KeyboardEvent it cares about.
 */
import { describe, it, expect } from 'vitest';
import { matchUndoRedoChord } from '@/components/blocks/render/EditableBlockRenderer.helpers';

function key(overrides: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }>) {
  return { key: '', metaKey: false, ctrlKey: false, shiftKey: false, ...overrides };
}

describe('matchUndoRedoChord', () => {
  it('Cmd+Z -> undo', () => {
    expect(matchUndoRedoChord(key({ key: 'z', metaKey: true }))).toBe('undo');
  });

  it('Ctrl+Z -> undo (non-mac)', () => {
    expect(matchUndoRedoChord(key({ key: 'z', ctrlKey: true }))).toBe('undo');
  });

  it('Cmd+Shift+Z -> redo', () => {
    expect(matchUndoRedoChord(key({ key: 'z', metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('Ctrl+Shift+Z -> redo (non-mac)', () => {
    expect(matchUndoRedoChord(key({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo');
  });

  it('is case-insensitive on the key (some layouts report "Z")', () => {
    expect(matchUndoRedoChord(key({ key: 'Z', metaKey: true }))).toBe('undo');
  });

  it('plain "z" with no modifier -> null (typing the letter)', () => {
    expect(matchUndoRedoChord(key({ key: 'z' }))).toBeNull();
  });

  it('Shift+Z with no meta/ctrl -> null (typing a capital Z)', () => {
    expect(matchUndoRedoChord(key({ key: 'z', shiftKey: true }))).toBeNull();
  });

  it('Cmd held with an unrelated key -> null', () => {
    expect(matchUndoRedoChord(key({ key: 'y', metaKey: true }))).toBeNull();
  });

  it('Cmd+Z with an empty key -> null (defensive)', () => {
    expect(matchUndoRedoChord(key({ key: '', metaKey: true }))).toBeNull();
  });
});
