# Feature Specification: Block Editor UX Improvements

**Feature Branch**: `001-block-editor-ux`
**Created**: 2026-01-27
**Status**: Draft
**Input**: User description: "review the current content block editor on http://localhost:3005/admin/posts/42/edit - use playwright mcp to test. Create a list of bugs and features and general improvements to the block editor, specific blocks, and so on. How can we make this content editor the best UX it can be."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Content Editor Can Quickly Identify and Fix React Console Errors (Priority: P1)

When content editors use the block editor, React console errors (specifically "Each child in a list should have a unique key prop" in ColumnsBlockPreview) create potential instability and confusion during testing/debugging sessions.

**Why this priority**: Console errors indicate code quality issues that can lead to unexpected behavior, performance problems, and difficulty debugging real issues. This is P1 because it affects system stability and developer confidence.

**Independent Test**: Can be tested by opening browser dev tools, navigating to the Content tab in the post editor, and verifying no React key prop warnings appear in the console.

**Acceptance Scenarios**:

1. **Given** a content editor opens a post with column blocks, **When** they view the browser console, **Then** no React key prop warnings are displayed
2. **Given** a developer is debugging the editor, **When** they check the console, **Then** only legitimate errors/warnings are shown, not framework violations

---

### User Story 2 - Content Editor Can Rearrange Blocks with Visual Drag-and-Drop (Priority: P1)

Content editors need to reorganize content blocks by dragging them to different positions within the document without using arrow buttons, allowing for natural, intuitive content restructuring.

**Why this priority**: P1 because visual drag-and-drop is a fundamental expectation for modern block editors (Gutenberg, Notion, etc.) and significantly impacts editing efficiency. Current arrow buttons are cumbersome for large documents.

**Independent Test**: Can be tested by grabbing a block's drag handle and moving it to a different position, then verifying the content order updates correctly.

**Acceptance Scenarios**:

1. **Given** a post with multiple blocks, **When** a user drags a paragraph block above a heading block, **Then** the content reorders immediately with smooth animation
2. **Given** a user is dragging a block, **When** they hover over valid drop zones, **Then** visual indicators show where the block will be placed
3. **Given** a user drags a block to an invalid location, **When** they release, **Then** the block returns to its original position

---

### User Story 3 - Content Editor Can See Block Type Icons at a Glance (Priority: P2)

Content editors need to quickly identify block types without reading text labels, using consistent visual iconography throughout the interface (block list, toolbar, picker modal).

**Why this priority**: P2 because current emoji-based icons (📝, 📄, 💬) work but could be more professional and consistent. This improves speed of use but doesn't block core functionality.

**Independent Test**: Can be tested by viewing the block picker, classic mode list, and toolbar to verify consistent iconography across all interfaces.

**Acceptance Scenarios**:

1. **Given** a user opens the block picker modal, **When** they scan the available blocks, **Then** each block type has a distinct, professional icon
2. **Given** a user views blocks in Classic mode, **When** they scan the content blocks list, **Then** icons match those shown in the block picker
3. **Given** a user selects a block, **When** the toolbar appears, **Then** action icons are intuitive and match common design patterns

---

### User Story 4 - Content Editor Can Use Keyboard Shortcuts for Common Actions (Priority: P2)

Content editors need to perform common editing actions (add block, delete block, move up/down, duplicate, save) using keyboard shortcuts for efficient workflow without mouse interaction.

**Why this priority**: P2 because keyboard shortcuts significantly improve power user efficiency and accessibility but the editor is functional without them.

**Independent Test**: Can be tested by attempting common shortcuts (Cmd+Enter for new block, Cmd+D for duplicate, Cmd+S for save, etc.) and verifying actions execute correctly.

**Acceptance Scenarios**:

1. **Given** a user has a block selected, **When** they press Cmd+Enter (Mac) or Ctrl+Enter (Windows), **Then** a new paragraph block is inserted below
2. **Given** a user has a block selected, **When** they press Cmd+D, **Then** the block is duplicated below the original
3. **Given** a user is editing, **When** they press Cmd+S, **Then** the post saves and shows a success message
4. **Given** a user has a block selected, **When** they press Cmd+Shift+Up/Down, **Then** the block moves up or down in the content
5. **Given** a user presses keyboard shortcuts, **When** they want help, **Then** a keyboard shortcut reference is accessible via "?" key

---

### User Story 5 - Content Editor Can See Real-Time Character/Word Count (Priority: P3)

Content editors need to see character and word counts for individual blocks and the entire document to meet content length requirements and optimize for readability/SEO.

**Why this priority**: P3 because it's a valuable feature for content planning but not critical for basic editing functionality.

**Independent Test**: Can be tested by typing in blocks and verifying live counts update in a status bar or block settings panel.

**Acceptance Scenarios**:

1. **Given** a user is editing a paragraph block, **When** they type text, **Then** character/word count updates in real-time in the block settings
2. **Given** a user has multiple blocks, **When** they view the editor footer, **Then** total document word/character count is displayed
3. **Given** a user selects a specific block, **When** they check the settings panel, **Then** counts for only that block are shown

---

### User Story 6 - Content Editor Can Preview Blocks Without Leaving Edit Mode (Priority: P2)

Content editors need to toggle between edit view and preview view for individual blocks or the entire document to see how content will appear to readers without saving and navigating away.

**Why this priority**: P2 because previewing is important for quality control but the current Visual mode provides some preview capability.

**Independent Test**: Can be tested by clicking a "Preview" toggle and verifying blocks render with frontend styling while remaining in the editor interface.

**Acceptance Scenarios**:

1. **Given** a user is editing content, **When** they click a "Preview" toggle, **Then** all blocks render with frontend styles
2. **Given** a user is in preview mode, **When** they hover over blocks, **Then** edit controls remain accessible
3. **Given** a user previews a specific block, **When** they click "Edit", **Then** they return to edit mode for that block only

---

### User Story 7 - Content Editor Can Undo/Redo Changes with Clear History (Priority: P1)

Content editors need to undo and redo changes to content blocks with confidence that all edits are tracked, including block additions, deletions, reordering, and content modifications.

**Why this priority**: P1 because undo/redo is a fundamental expectation for any content editing tool and prevents data loss from accidental actions.

**Independent Test**: Can be tested by making various edits (add, delete, reorder, modify blocks), clicking undo repeatedly to verify each action reverses, then clicking redo to verify actions replay correctly.

**Acceptance Scenarios**:

1. **Given** a user deletes a block, **When** they press Cmd+Z, **Then** the block is restored with all its content
2. **Given** a user makes multiple edits, **When** they press Cmd+Z multiple times, **Then** changes undo in reverse chronological order
3. **Given** a user has undone changes, **When** they press Cmd+Shift+Z, **Then** changes redo in forward chronological order
4. **Given** a user undoes to a previous state, **When** they make a new edit, **Then** the redo history is cleared

---

### User Story 8 - Content Editor Can Search and Filter Available Blocks (Priority: P3)

Content editors need to search for blocks by name or category in the block picker modal to quickly find specific block types in a large library without scrolling.

**Why this priority**: P3 because the current categorized view works for the existing block count, but searchability becomes more important as the block library grows.

**Independent Test**: Can be tested by opening the block picker, typing "quote" in a search field, and verifying only relevant blocks (Quote) are displayed.

**Acceptance Scenarios**:

1. **Given** a user opens the block picker, **When** they type "heading" in the search field, **Then** only the Heading block is shown
2. **Given** a user searches for blocks, **When** they clear the search, **Then** all blocks reappear in their categories
3. **Given** a user searches for a non-existent block, **When** no matches are found, **Then** a helpful "No blocks found" message appears

---

### User Story 9 - Content Editor Can Collapse/Expand Large Blocks (Priority: P3)

Content editors need to collapse large blocks (long paragraphs, columns, accordions) into compact representations to improve navigation and focus on specific sections in long documents.

**Why this priority**: P3 because it improves experience for very long posts but isn't essential for most content editing workflows.

**Independent Test**: Can be tested by clicking a collapse icon on a large block and verifying it compresses to a single-line preview with block type and first few words.

**Acceptance Scenarios**:

1. **Given** a user has a long paragraph block, **When** they click the collapse icon, **Then** the block shows only the first 50 characters with "..." and block type
2. **Given** a user has collapsed blocks, **When** they click expand, **Then** the full block content is restored
3. **Given** a user saves with collapsed blocks, **When** they reload the page, **Then** collapsed state persists

---

### User Story 10 - Content Editor Can Paste Rich Content from External Sources (Priority: P2)

Content editors need to paste content from Word documents, Google Docs, websites, and other rich text sources and have the editor intelligently convert it to appropriate blocks while preserving formatting.

**Why this priority**: P2 because pasting is a common workflow for content migration and collaboration, but manual block creation is an acceptable fallback.

**Independent Test**: Can be tested by copying formatted content from Word/Google Docs (headings, paragraphs, lists, images) and pasting into the editor, then verifying correct block types are created.

**Acceptance Scenarios**:

1. **Given** a user copies content with headings and paragraphs from Word, **When** they paste into the editor, **Then** heading blocks and paragraph blocks are created automatically
2. **Given** a user pastes content with inline formatting (bold, italic, links), **When** the blocks are created, **Then** formatting is preserved
3. **Given** a user pastes an image from a website, **When** the paste completes, **Then** an image block is created with the image URL
4. **Given** pasted content contains unsupported elements, **When** conversion completes, **Then** a notification explains what couldn't be converted

---

### Edge Cases

- What happens when a user drags a block outside the editor boundary?
- How does the system handle attempting to delete the last remaining block in a document?
- What occurs when undo/redo history exceeds memory limits in very long editing sessions?
- How does the editor behave when network connection is lost during auto-save?
- What happens when a user attempts to paste extremely large content (e.g., 10,000 word document)?
- How does the editor handle special characters, emojis, and non-Latin scripts in block content?
- What occurs when a user has unsaved changes and closes the browser tab?
- How does the system handle concurrent editing if multiple users access the same post?
- What happens when a custom field value exceeds expected length limits?
- How does the editor respond when a media URL (image/video) becomes unavailable?

## Requirements *(mandatory)*

### Functional Requirements

**Code Quality & Stability**
- **FR-001**: System MUST render all blocks without React console errors or warnings
- **FR-002**: Block components MUST use unique key props when rendering lists of child elements
- **FR-003**: System MUST validate block data structure before rendering to prevent runtime errors

**Block Manipulation**
- **FR-004**: Users MUST be able to drag blocks to reorder them within the content
- **FR-005**: System MUST provide visual feedback (drop zones, ghost elements) during drag operations
- **FR-006**: System MUST prevent invalid drag-and-drop operations (e.g., dragging outside boundaries)
- **FR-007**: Users MUST be able to duplicate blocks while preserving all content and settings
- **FR-008**: Users MUST be able to delete blocks with a confirmation for destructive actions

**Content History**
- **FR-009**: System MUST track all content changes in an undo/redo history
- **FR-010**: Users MUST be able to undo the last 50 actions
- **FR-011**: Users MUST be able to redo previously undone actions
- **FR-012**: System MUST clear redo history when new edits are made after undo

**Keyboard Accessibility**
- **FR-013**: System MUST support keyboard shortcuts for common actions (add, delete, duplicate, move, save)
- **FR-014**: All interactive elements MUST be keyboard accessible (Tab, Enter, Space, Arrow keys)
- **FR-015**: System MUST provide a keyboard shortcut reference accessible from the editor

**Content Analysis**
- **FR-016**: System MUST display real-time word and character counts for the entire document
- **FR-017**: System MUST display word and character counts for individual selected blocks
- **FR-018**: Counts MUST update immediately as users type or modify content

**Visual Feedback**
- **FR-019**: System MUST use consistent iconography across all editor interfaces (block picker, toolbar, lists)
- **FR-020**: Selected blocks MUST have clear visual indication (border, background, or highlight)
- **FR-021**: Block controls (move, duplicate, delete) MUST be easily accessible when blocks are selected

**Content Import**
- **FR-022**: System MUST intelligently parse pasted rich content and convert to appropriate block types
- **FR-023**: System MUST preserve inline formatting (bold, italic, links) when pasting content
- **FR-024**: System MUST handle pasted images and convert them to image blocks
- **FR-025**: System MUST notify users of any content that couldn't be converted during paste

**Block Discovery**
- **FR-026**: Block picker modal MUST allow users to search blocks by name or category
- **FR-027**: Search results MUST update in real-time as users type
- **FR-028**: System MUST display helpful messages when no blocks match search criteria

**Preview Mode**
- **FR-029**: Users MUST be able to toggle between edit and preview modes for the entire document
- **FR-030**: Preview mode MUST render blocks using frontend styles and formatting
- **FR-031**: Users MUST be able to return to edit mode without losing changes

**Long Document Management**
- **FR-032**: Users MUST be able to collapse large blocks into compact representations
- **FR-033**: Collapsed state MUST persist when saving and reloading the document
- **FR-034**: System MUST display block type and preview text for collapsed blocks

**Data Persistence**
- **FR-035**: System MUST auto-save content changes at regular intervals
- **FR-036**: System MUST warn users before leaving the page with unsaved changes
- **FR-037**: System MUST indicate save status (saving, saved, error) clearly to users

### Key Entities

- **Block**: Represents a unit of content in the editor with properties including type (heading, paragraph, image, etc.), content, order position, settings (alignment, size, style), and unique identifier
- **Block History Entry**: Represents a snapshot of document state at a point in time for undo/redo functionality, including timestamp, action type (add, delete, modify, reorder), affected blocks, and previous/new state
- **Block Type Definition**: Represents the configuration for a block category including display name, icon, category (Basic, Media, Layout, Components), default settings, and available customization options
- **Content Statistics**: Represents calculated metrics for content including total word count, character count, reading time estimate, and per-block statistics

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can reorder content blocks by dragging them to new positions in under 3 seconds
- **SC-002**: System renders all blocks without any React console errors or warnings
- **SC-003**: Users can undo and redo the last 50 actions with 100% accuracy
- **SC-004**: Keyboard shortcuts reduce time for common actions (add block, duplicate, delete) by 50% compared to mouse-only interaction
- **SC-005**: Users can find any block type using search in the block picker in under 5 seconds
- **SC-006**: Rich content pasted from Word or Google Docs converts to correct block types with 90% accuracy
- **SC-007**: Word and character counts update in real-time with less than 100ms delay
- **SC-008**: 95% of users successfully complete block reordering on first attempt without errors
- **SC-009**: Preview mode renders blocks identically to frontend display with 100% visual accuracy
- **SC-010**: Auto-save prevents data loss in 99.9% of browser crashes or unexpected closures
- **SC-011**: Users can navigate the entire editor interface using only keyboard with no mouse required
- **SC-012**: Content editors report 40% faster editing workflow compared to current implementation

## Assumptions

1. Users are familiar with block-based editing concepts (similar to WordPress Gutenberg, Notion, or modern CMS editors)
2. The editor will be used primarily on desktop/laptop devices with mouse and keyboard (mobile optimization is separate)
3. Auto-save interval will be every 30 seconds or after significant content changes
4. Undo/redo history limit of 50 actions balances functionality with memory constraints
5. Drag-and-drop will use native HTML5 drag events for broad browser compatibility
6. Keyboard shortcuts will follow common conventions (Cmd on Mac, Ctrl on Windows/Linux)
7. Block collapse feature will store state in browser local storage for session persistence
8. Rich content paste will prioritize semantic HTML conversion over proprietary format preservation

## Open Questions

These questions will be addressed during implementation planning:

1. Should undo/redo history persist across page reloads or only during active editing sessions?
2. What visual animation style should be used for drag-and-drop (ghost element, placeholder, or both)?
3. Should keyboard shortcuts be customizable by users or follow fixed conventions?
4. How should the system handle conflicts if concurrent editing support is added in the future?
5. Should collapsed blocks show a character limit preview or just the block type?
6. What is the optimal auto-save interval balancing data safety and server load?
