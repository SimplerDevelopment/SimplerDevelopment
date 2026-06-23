# Data Model: Block Editor UX Improvements

**Feature**: Block Editor UX Improvements
**Date**: 2026-01-27
**Purpose**: Define data structures for editor state, history, and content analysis

## Existing Data Model (from spec.md)

### Block (from types/blocks.ts - existing)

```typescript
interface BaseBlock {
  id: string;           // Unique identifier (UUID)
  type: string;         // Block type (heading, text, image, etc.)
  order: number;        // Position in document
}

// Extended by specific block types:
interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
  alignment?: 'left' | 'center' | 'right';
  size?: 'small' | 'base' | 'large' | 'xl';
}

interface HeadingBlock extends BaseBlock {
  type: 'heading';
  content: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  alignment?: 'left' | 'center' | 'right';
}

// ... 19 more block types

interface ColumnsBlock extends BaseBlock {
  type: 'columns';
  columns: Column[];
  gap?: 'sm' | 'md' | 'lg';
}

interface Column {
  width: string;      // Percentage (e.g., "50")
  blocks: Block[];    // Nested blocks (recursive)
}
```

**Storage Format** (existing):
```typescript
interface BlockEditorData {
  blocks: Block[];
  version: string;    // "1.0"
}
// Serialized as JSON string in posts.content field
```

---

## New Data Structures

### 1. History Entry

Represents a snapshot in the undo/redo history.

```typescript
interface HistoryEntry {
  blocks: Block[];                    // Complete block state at this point
  timestamp: number;                  // Unix timestamp (ms)
  action: HistoryAction;              // Type of action that created this entry
  affectedBlockIds?: string[];        // IDs of blocks changed (for optimization)
}

interface HistoryAction {
  type: 'add' | 'delete' | 'modify' | 'reorder' | 'duplicate';
  description: string;                // Human-readable (e.g., "Added heading block")
}
```

**Relationships**:
- History entries form a time-ordered sequence
- Each entry contains a complete copy of blocks array
- affectedBlockIds allows selective comparison for optimization

**Validation Rules**:
- Maximum 50 entries in history (configurable)
- Timestamps must be in ascending order
- blocks array must pass existing Block validation

**State Transitions**:
```
Initial State (empty history)
    ↓
[User makes edit]
    ↓
Create HistoryEntry with new blocks state
    ↓
Push to past[] array
    ↓
Clear future[] array (can't redo after new action)
    ↓
Trim past[] to max 50 entries (remove oldest if needed)
```

---

### 2. Editor State

Shared state across editor components.

```typescript
interface EditorState {
  // Content
  blocks: Block[];

  // Selection & Focus
  selectedBlockId: string | null;
  hoveredBlockId: string | null;
  focusedBlockId: string | null;      // NEW: For keyboard navigation

  // UI State
  showBlockPicker: boolean;
  showKeyboardReference: boolean;     // NEW: Keyboard shortcuts modal
  insertPosition: number | null;      // NEW: Where to insert new block

  // Drag-and-Drop
  isDragging: boolean;                // NEW
  draggedBlockId: string | null;      // NEW
  dropTargetIndex: number | null;     // NEW

  // History
  canUndo: boolean;                   // NEW
  canRedo: boolean;                   // NEW

  // Content Analysis
  stats: ContentStats;                // NEW

  // Save State
  saveStatus: SaveStatus;             // NEW
  lastSavedAt: number | null;         // NEW: Unix timestamp
  hasUnsavedChanges: boolean;         // NEW
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
```

**Relationships**:
- EditorState is provided via React Context
- Multiple components can read/update shared state
- State changes trigger re-renders only for subscribed components

**Validation Rules**:
- selectedBlockId must exist in blocks array or be null
- insertPosition must be valid index (0 to blocks.length) or null
- dropTargetIndex must be valid index during drag operation
- stats must be recalculated when blocks change

---

### 3. Content Statistics

```typescript
interface ContentStats {
  // Overall document
  totalWords: number;
  totalCharacters: number;
  totalCharactersNoSpaces: number;
  totalSentences: number;
  readingTimeMinutes: number;         // Based on 200 WPM average

  // Per-block (for selected block)
  selectedBlockWords: number;
  selectedBlockCharacters: number;

  // Block type breakdown
  blockCounts: Record<string, number>; // { heading: 5, text: 12, image: 3 }
}
```

**Calculation**:
- totalWords: Regex word splitting, handles edge cases
- readingTimeMinutes: Math.ceil(totalWords / 200)
- Recalculated on block changes with useMemo
- Debounced updates (300ms) for performance

---

### 4. Drag-and-Drop State

```typescript
interface DragState {
  active: {
    id: string;                       // Block ID being dragged
    index: number;                    // Original position
  } | null;

  over: {
    id: string;                       // Drop target block ID
    index: number;                    // Drop position
  } | null;
}
```

**State Flow** (@dnd-kit):
```
onDragStart
    ↓
Set active: { id, index }
Update isDragging: true
    ↓
onDragOver (continuous)
    ↓
Update over: { id, index }
Show drop indicator at over.index
    ↓
onDragEnd
    ↓
Reorder blocks array
Create history entry
Clear active and over
Update isDragging: false
```

---

### 5. Keyboard Shortcut Definition

```typescript
interface KeyboardShortcut {
  keys: string;                       // Mousetrap format (e.g., "mod+z")
  description: string;                // Human-readable (e.g., "Undo last action")
  category: 'editing' | 'navigation' | 'blocks' | 'system';
  handler: () => void;
}

const SHORTCUTS: KeyboardShortcut[] = [
  {
    keys: 'mod+z',
    description: 'Undo last action',
    category: 'editing',
    handler: () => history.undo()
  },
  {
    keys: 'mod+shift+z',
    description: 'Redo last action',
    category: 'editing',
    handler: () => history.redo()
  },
  {
    keys: 'mod+enter',
    description: 'Add new block below',
    category: 'blocks',
    handler: () => addBlockBelow()
  },
  // ... more shortcuts
];
```

---

### 6. Rich Paste Result

```typescript
interface PasteResult {
  blocks: Block[];                    // Converted blocks
  warnings: PasteWarning[];           // Elements that couldn't convert
  success: boolean;                   // Overall success status
}

interface PasteWarning {
  type: 'unsupported_element' | 'image_failed' | 'formatting_lost';
  element: string;                    // HTML element name (e.g., "table")
  message: string;                    // User-friendly explanation
}
```

**Conversion Rules**:
```typescript
const HTML_TO_BLOCK_MAP: Record<string, (node: HTMLElement) => Block | null> = {
  'H1': (node) => createHeadingBlock(node.textContent, 1),
  'H2': (node) => createHeadingBlock(node.textContent, 2),
  'H3': (node) => createHeadingBlock(node.textContent, 3),
  'H4': (node) => createHeadingBlock(node.textContent, 4),
  'H5': (node) => createHeadingBlock(node.textContent, 5),
  'H6': (node) => createHeadingBlock(node.textContent, 6),
  'P': (node) => createTextBlock(node.innerHTML), // Preserves inline formatting
  'IMG': (node) => createImageBlock(node.src, node.alt),
  'BLOCKQUOTE': (node) => createQuoteBlock(node.textContent),
  // ... more mappings
};
```

---

## Data Flow Diagrams

### Undo/Redo Flow

```
User Action (e.g., delete block)
    ↓
Before deletion:
  - Create HistoryEntry with current blocks
  - Push to history.past[]
  - Clear history.future[]
    ↓
Perform deletion
    ↓
Update EditorState.blocks
Update EditorState.canUndo = true
Update EditorState.canRedo = false
    ↓
Trigger re-render
```

```
User presses Cmd+Z (undo)
    ↓
Check history.past.length > 0
    ↓
Pop last entry from history.past[]
Push current state to history.future[]
    ↓
Restore blocks from popped entry
    ↓
Update EditorState.blocks
Update canUndo/canRedo flags
    ↓
Trigger re-render
```

### Drag-and-Drop Flow

```
User grabs block (DnD onDragStart)
    ↓
Update EditorState:
  - isDragging = true
  - draggedBlockId = block.id
    ↓
User drags over other blocks (DnD onDragOver)
    ↓
Update EditorState:
  - dropTargetIndex = calculated position
    ↓
Render drop indicator at dropTargetIndex
    ↓
User releases block (DnD onDragEnd)
    ↓
Before reordering:
  - Create HistoryEntry with current blocks
    ↓
Reorder blocks array:
  - Remove block from original position
  - Insert at dropTargetIndex
    ↓
Update EditorState:
  - blocks = reordered array
  - isDragging = false
  - draggedBlockId = null
  - dropTargetIndex = null
    ↓
Trigger re-render with smooth animation
```

### Auto-Save Flow

```
User edits content
    ↓
EditorState.blocks changes
Update hasUnsavedChanges = true
    ↓
Debounced save triggered (30s delay)
    ↓
If another edit occurs within 30s:
  - Reset debounce timer
  - Continue waiting
    ↓
30s of inactivity reached
    ↓
Update saveStatus = 'saving'
    ↓
API call to save post
    ↓
Success:
  - saveStatus = 'saved'
  - lastSavedAt = Date.now()
  - hasUnsavedChanges = false
  - After 2s: saveStatus = 'idle'
    ↓
Failure:
  - saveStatus = 'error'
  - Show "Retry" button
  - Keep hasUnsavedChanges = true
```

---

## Memory Considerations

### History Size Management

```typescript
class BlockHistory {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private readonly MAX_SIZE = 50;

  push(entry: HistoryEntry): void {
    this.past.push(entry);

    // Trim if exceeds max size
    if (this.past.length > this.MAX_SIZE) {
      this.past.shift(); // Remove oldest
    }

    // Clear future (can't redo after new action)
    this.future = [];
  }

  // Estimated memory per entry: ~10-50KB
  // Total memory with 50 entries: ~500KB - 2.5MB
  // Acceptable for modern browsers
}
```

### Statistics Caching

```typescript
// Use React.useMemo to avoid recalculation
const stats = useMemo(() => {
  return analyzeContent(blocks);
}, [blocks]); // Only recalculate when blocks change

// Debounce live updates
const debouncedUpdateStats = useMemo(
  () => debounce(updateStats, 300),
  []
);
```

---

## Backward Compatibility

### Version Migration

Current storage format:
```json
{
  "blocks": [...],
  "version": "1.0"
}
```

No changes needed to storage format. All new features are runtime-only (undo/redo, drag-drop, stats).

**Validation**: Existing posts will load without migration. New features enhance editing experience without affecting data structure.

---

## Summary

New data structures add:
- **HistoryEntry**: Time-travel through edits (undo/redo)
- **EditorState**: Centralized state for all editor features
- **ContentStats**: Real-time content analysis
- **DragState**: Smooth drag-and-drop interactions
- **PasteResult**: Intelligent rich content conversion

All structures are TypeScript-first with full type safety. No database schema changes required - enhancements are runtime-only.
