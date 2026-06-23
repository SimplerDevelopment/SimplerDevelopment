# Research: Block Editor UX Improvements

**Feature**: Block Editor UX Improvements
**Date**: 2026-01-27
**Purpose**: Resolve technical unknowns and research best practices for implementation

## Research Tasks

### 1. Test Framework Selection

**Decision**: Vitest + React Testing Library + Playwright

**Rationale**:
- **Vitest**: Native ESM support, fast execution, compatible with Next.js 16 and Vite-based tooling
- **React Testing Library**: Industry standard for component testing, encourages accessibility-first testing patterns
- **Playwright**: Best-in-class E2E testing for modern web apps, official Next.js integration, browser automation for drag-and-drop testing

**Alternatives Considered**:
- **Jest**: Slower than Vitest, more complex ESM configuration with Next.js 16
- **Cypress**: Good but Playwright has better Next.js integration and faster execution
- **Testing Library + Jest**: Would work but Vitest is faster and has better TS support

**Implementation Notes**:
- Install: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@playwright/test`
- Configure `vitest.config.ts` with React support
- Configure `playwright.config.ts` for E2E tests
- Add test scripts to `package.json`

**Sources**:
- https://vitest.dev/guide/
- https://testing-library.com/docs/react-testing-library/intro/
- https://playwright.dev/docs/intro

---

### 2. Drag-and-Drop Implementation Strategy

**Decision**: @dnd-kit/core + @dnd-kit/sortable

**Rationale**:
- **Modern**: Built specifically for React hooks, no legacy class component patterns
- **Accessible**: WCAG compliant out-of-the-box with keyboard navigation
- **Performant**: Uses CSS transforms instead of DOM manipulation, 60fps animations
- **Flexible**: Supports complex scenarios (nested lists, multiple drop zones, custom collision detection)
- **Active Maintenance**: Regular updates, good TypeScript support

**Alternatives Considered**:
- **react-beautiful-dnd**: Popular but no longer actively maintained by Atlassian
- **react-dnd**: Older, more complex API, based on HTML5 DnD which has accessibility issues
- **Native HTML5 Drag-and-Drop**: Poor mobile support, accessibility concerns, inconsistent browser behavior
- **Custom solution**: Would require significant effort to match @dnd-kit's features and accessibility

**Implementation Notes**:
- Install: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- Use `<DndContext>` wrapper around block list
- `<SortableContext>` for block array
- `useSortable` hook for individual blocks
- Handle nested blocks with recursive DndContext
- Add visual indicators with `transform` and `transition` CSS

**Key Features**:
- Smooth animations with Framer Motion integration
- Collision detection algorithms for precise drop positioning
- Accessibility: Full keyboard support (Space to grab, Arrow keys to move, Enter/Esc to drop/cancel)
- Touch support for mobile/tablet

**Sources**:
- https://docs.dndkit.com/
- https://github.com/clauderic/dnd-kit
- https://docs.dndkit.com/api-documentation/sortable

---

### 3. Undo/Redo History Management

**Decision**: Custom history manager with Immer for immutability

**Rationale**:
- **Immer**: Simplifies immutable state updates, prevents accidental mutations
- **Custom solution**: Gives full control over history size, serialization, and memory management
- **Command Pattern**: Each action is a command object with undo/redo methods
- **Efficient**: Only stores diffs for memory optimization

**Alternatives Considered**:
- **use-undo**: Simple but lacks command pattern, less flexible for complex operations
- **Redux with redux-undo**: Overkill for this feature, adds unnecessary complexity
- **zustand-middleware-undo**: Good but we're not using Zustand globally

**Implementation Notes**:
```typescript
// lib/utils/blockHistory.ts
interface HistoryEntry<T> {
  state: T;
  timestamp: number;
}

class History<T> {
  private past: HistoryEntry<T>[] = [];
  private future: HistoryEntry<T>[] = [];
  private maxSize = 50;

  push(state: T): void;
  undo(): T | undefined;
  redo(): T | undefined;
  clear(): void;
}
```

**Memory Management**:
- Limit to 50 entries (configurable)
- Use circular buffer for constant memory
- Serialize large blocks lazily
- Clear redo stack on new action

**Sources**:
- https://github.com/immerjs/immer
- Design Patterns: Command Pattern (Gang of Four)
- https://martinfowler.com/eaaDev/EventSourcing.html

---

### 4. Rich Content Paste Parser

**Decision**: Custom parser using DOMParser API + unified/remark

**Rationale**:
- **DOMParser**: Native browser API, reliable HTML parsing
- **unified/remark**: Industry-standard Markdown processing, extensible
- **Custom conversion rules**: Map HTML elements to block types (h1-h6 → heading, p → text, img → image, etc.)
- **Preserves formatting**: Maintains bold, italic, links through Markdown-style markers

**Alternatives Considered**:
- **turndown**: Good HTML→Markdown but less flexible for custom block types
- **cheerio**: Server-side, unnecessary for client-side parsing
- **Regex-based parsing**: Fragile, hard to maintain, poor HTML support

**Implementation Notes**:
```typescript
// lib/utils/richPaste.ts
export function parseRichContent(html: string): Block[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  return convertNodesToBlocks(doc.body.childNodes);
}

function convertNodesToBlocks(nodes: NodeList): Block[] {
  // Map HTML elements to block types
  // h1-h6 → heading block
  // p → text block
  // img → image block
  // blockquote → quote block
  // ul/ol → list handling
  // div/span → content extraction
}
```

**Word/Google Docs Handling**:
- Strip proprietary styles and classes
- Extract clean semantic HTML
- Handle inline images (base64 or URL)
- Preserve text formatting (bold, italic, underline)
- Convert tables to structured blocks if possible

**Sources**:
- https://developer.mozilla.org/en-US/docs/Web/API/DOMParser
- https://github.com/remarkjs/remark
- https://unifiedjs.com/

---

### 5. Keyboard Shortcuts Implementation

**Decision**: Custom hook with mousetrap library

**Rationale**:
- **mousetrap**: Lightweight (2KB), cross-platform key binding, handles Cmd/Ctrl automatically
- **Hook-based**: Integrates cleanly with React lifecycle
- **Scoped**: Can enable/disable shortcuts based on focus context
- **Customizable**: Easy to add/remove shortcuts

**Alternatives Considered**:
- **react-hotkeys-hook**: Good but mousetrap has better cross-platform support
- **hotkeys-js**: Similar to mousetrap but less mature
- **Native event listeners**: More boilerplate, harder to manage cleanup

**Implementation Notes**:
```typescript
// lib/hooks/useKeyboardShortcuts.ts
import Mousetrap from 'mousetrap';

export function useKeyboardShortcuts(
  shortcuts: Record<string, () => void>,
  deps: any[]
) {
  useEffect(() => {
    Object.entries(shortcuts).forEach(([keys, handler]) => {
      Mousetrap.bind(keys, handler);
    });

    return () => {
      Object.keys(shortcuts).forEach(keys => {
        Mousetrap.unbind(keys);
      });
    };
  }, deps);
}
```

**Shortcut Mapping**:
- `mod+enter` → Add new block below (mod = Cmd on Mac, Ctrl on Windows)
- `mod+d` → Duplicate block
- `mod+shift+up/down` → Move block up/down
- `mod+z` → Undo
- `mod+shift+z` → Redo
- `mod+s` → Save
- `del` / `backspace` → Delete block (with confirmation)
- `?` → Show keyboard shortcuts reference

**Sources**:
- https://github.com/ccampbell/mousetrap
- https://craig.is/killing/mice (mousetrap docs)

---

### 6. Word/Character Count Implementation

**Decision**: Custom utility with memoization

**Rationale**:
- **Simple**: Regex-based word splitting, character counting
- **Fast**: Memoized with React.useMemo to avoid recalculation
- **Accurate**: Handles edge cases (punctuation, special chars, multiple spaces)

**Implementation Notes**:
```typescript
// lib/utils/wordCount.ts
export interface ContentStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  readingTimeMinutes: number;
}

export function analyzeContent(blocks: Block[]): ContentStats {
  const text = extractPlainText(blocks);

  return {
    words: countWords(text),
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    sentences: countSentences(text),
    readingTimeMinutes: Math.ceil(countWords(text) / 200) // 200 WPM avg
  };
}

function extractPlainText(blocks: Block[]): string {
  // Recursively extract text from all blocks
  // Handle nested blocks (columns, tabs)
  // Strip HTML/Markdown formatting
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .length;
}
```

**Performance**:
- Debounce updates (300ms) to avoid excessive recalculation
- Use React.useMemo with block content as dependency
- Calculate per-block on selection, full document in footer

**Sources**:
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
- Medium article: "How to count words accurately"

---

### 7. Auto-Save Strategy

**Decision**: Debounced auto-save with optimistic UI

**Rationale**:
- **Debounce**: Wait 30 seconds after last edit to reduce server requests
- **Optimistic UI**: Show "Saved" immediately on successful save
- **Error handling**: Show retry button on failure, maintain unsaved state
- **beforeunload**: Warn users if unsaved changes exist

**Implementation Notes**:
```typescript
// In PostForm.tsx
const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
const debouncedSave = useMemo(
  () => debounce(async (blocks: Block[]) => {
    setSaveStatus('saving');
    try {
      await savePost({ ...post, content: JSON.stringify({ blocks, version: '1.0' }) });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
    }
  }, 30000),
  []
);

useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (saveStatus === 'saving' || hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [saveStatus, hasUnsavedChanges]);
```

**Save Indicators**:
- "Saving..." - Gray spinner
- "Saved" - Green checkmark (disappears after 2s)
- "Error saving" - Red warning icon with "Retry" button
- Footer status: "Last saved 2 minutes ago"

**Sources**:
- https://lodash.com/docs/#debounce
- https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event

---

### 8. React Key Prop Fix

**Decision**: Add unique key to mapped columns in ColumnsBlockPreview

**Rationale**:
- **Simple fix**: React requires unique keys for list items
- **Root cause**: ColumnsBlockPreview maps over columns without key prop
- **Impact**: Console error, potential rendering issues

**Implementation**:
```tsx
// components/blocks/visual/ColumnsBlockPreview.tsx
// BEFORE:
{block.columns.map((column, index) => (
  <div className="column">
    {/* column content */}
  </div>
))}

// AFTER:
{block.columns.map((column, index) => (
  <div key={`${block.id}-column-${index}`} className="column">
    {/* column content */}
  </div>
))}
```

**Verification**:
- Open post with column blocks
- Check browser console - no React warnings
- Test column adding/removing/reordering

**Sources**:
- https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key

---

## Summary of Technology Choices

| Area | Technology | Rationale |
|------|-----------|-----------|
| Unit Testing | Vitest + React Testing Library | Fast, modern, great TS support |
| E2E Testing | Playwright | Best Next.js integration, reliable |
| Drag-and-Drop | @dnd-kit/core + @dnd-kit/sortable | Modern, accessible, performant |
| Undo/Redo | Custom History + Immer | Full control, memory efficient |
| Rich Paste | DOMParser + unified/remark | Native API + proven library |
| Keyboard Shortcuts | mousetrap | Lightweight, cross-platform |
| Word Count | Custom utility + useMemo | Simple, fast, accurate |
| Auto-Save | Debounced save + optimistic UI | Balance UX and server load |

## Next Steps

Proceed to Phase 1: Design & Contracts
- Create data-model.md for history entries and editor state
- Define API contracts for save operations
- Generate quickstart.md for development setup
- Update CLAUDE.md with new dependencies
