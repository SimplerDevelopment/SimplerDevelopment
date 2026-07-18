# Implementation Plan: Block Editor UX Improvements

**Branch**: `001-block-editor-ux` | **Date**: 2026-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-block-editor-ux/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Transform the existing block editor from a functional but basic interface into a best-in-class content editing experience. Primary improvements include: fixing React console errors in ColumnsBlockPreview, implementing visual drag-and-drop for block reordering, adding comprehensive undo/redo system with 50-action history, keyboard shortcuts for power users, rich content paste from Word/Google Docs, and real-time word/character counting. The implementation will build upon the existing Next.js 16/React 19/TypeScript 5 stack with VisualBlockEditor and BlockEditor components, enhancing state management to support history tracking and improving UI/UX with modern interaction patterns while maintaining the current JSON-based block storage model.

## Technical Context

**Language/Version**: TypeScript 5.x with Next.js 16.1.1 (App Router), React 19.2.3
**Primary Dependencies**: React Hook Form 7.71.0, Zod 4.3.5, Tailwind CSS 4, Framer Motion 12.26.2, Drizzle ORM 0.45.1
**Storage**: PostgreSQL (posts.content stores JSON serialized blocks)
**Testing**: NEEDS CLARIFICATION (no test framework currently configured - Jest, Vitest, or Playwright Component Testing recommended)
**Target Platform**: Web browsers (desktop/laptop primary, modern evergreen browsers)
**Project Type**: Web application (Next.js App Router with /app directory structure)
**Performance Goals**:
  - Block operations (add/delete/reorder) <100ms
  - Drag-and-drop visual feedback <16ms (60fps)
  - Undo/redo operations <50ms
  - Word count updates <100ms
  - Auto-save within 30 seconds of changes
**Constraints**:
  - Maintain backward compatibility with existing JSON block format
  - Support 50-action undo/redo history without excessive memory usage
  - Rich paste must handle documents up to 10,000 words
  - No external drag-and-drop libraries (prefer native HTML5 DnD or React state-based solution)
**Scale/Scope**:
  - 21 existing block types across 4 categories
  - Support documents with 100+ blocks
  - Handle nested blocks (columns/tabs) up to 3 levels deep
  - Target: 1000+ content editors using the system

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: ⚠️ PENDING - Constitution file is a template and needs to be customized for this project.

**Note**: The constitution file at `.specify/memory/constitution.md` contains only placeholder content. Once a project-specific constitution is defined, this section will be updated with relevant gates such as:
- Test-first requirements (if TDD mandatory)
- Library-first architecture (if applicable)
- CLI interface requirements (if applicable)
- Integration testing requirements
- Observability/logging standards
- Versioning policies

**For this feature**: Since no constitution is currently enforced, proceeding with standard best practices:
- Component testing for block editor interactions
- Integration testing for drag-and-drop, undo/redo
- Unit testing for utility functions (word count, paste parsing)
- E2E testing for critical user flows

**Re-evaluation required**: After Phase 1 design is complete, if a project constitution is established.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Next.js 16 App Router Structure (Web Application)

app/
├── admin/
│   └── posts/
│       └── [id]/
│           └── edit/
│               └── page.tsx          # Post editor page (integrates block editor)

components/
├── blocks/
│   ├── BlockEditor.tsx               # Classic editor (existing)
│   ├── VisualBlockEditor.tsx         # Visual editor (existing - will be enhanced)
│   ├── edit/                         # Classic mode block editors
│   │   ├── TextBlockEdit.tsx
│   │   ├── HeadingBlockEdit.tsx
│   │   └── [19 more block editors]
│   ├── render/                       # Frontend block renderers
│   │   ├── BlockRenderer.tsx
│   │   ├── TextBlockRender.tsx
│   │   └── [20+ render components]
│   └── visual/                       # Visual mode previews & settings
│       ├── VisualBlockPreview.tsx
│       ├── BlockSettings.tsx
│       ├── ColumnsBlockPreview.tsx   # FIX: Add key props here (P1)
│       └── [20+ preview components]
├── admin/
│   ├── PostForm.tsx                  # Form integration (will be enhanced)
│   └── MediaPicker.tsx               # Media selection
└── ui/                               # Shared UI components (shadcn/ui style)

lib/
├── db/
│   └── schema.ts                     # Database schema (posts table)
├── utils/                            # NEW: Utilities for this feature
│   ├── blockHistory.ts               # NEW: Undo/redo history manager
│   ├── richPaste.ts                  # NEW: Rich content paste parser
│   ├── wordCount.ts                  # NEW: Content analysis utilities
│   └── keyboardShortcuts.ts          # NEW: Keyboard handler
└── hooks/                            # NEW: Custom React hooks
    ├── useBlockHistory.ts            # NEW: Undo/redo hook
    ├── useBlockDragDrop.ts           # NEW: Drag-and-drop hook
    └── useKeyboardShortcuts.ts       # NEW: Keyboard shortcuts hook

types/
└── blocks.ts                         # Block type definitions (existing)

contexts/                             # NEW: React contexts
└── BlockEditorContext.tsx            # NEW: Shared editor state

tests/                                # NEW: Test suite (to be created)
├── unit/
│   ├── blockHistory.test.ts
│   ├── richPaste.test.ts
│   └── wordCount.test.ts
├── integration/
│   ├── dragDrop.test.tsx
│   ├── undoRedo.test.tsx
│   └── keyboardShortcuts.test.tsx
└── e2e/
    ├── blockEditing.spec.ts
    └── contentCreation.spec.ts
```

**Structure Decision**: Next.js App Router web application structure. The existing block editor components are located in `/components/blocks/` with three sub-directories: `/edit/` (Classic mode editors), `/render/` (frontend renderers), and `/visual/` (Visual mode previews).

New feature code will be added to:
- `/lib/utils/` - Pure utility functions (history, paste parsing, word count)
- `/lib/hooks/` - React hooks for editor features
- `/contexts/` - React Context for shared editor state
- `/tests/` - Comprehensive test suite (not yet implemented)

Existing components to be enhanced:
- `VisualBlockEditor.tsx` - Add drag-and-drop, undo/redo, keyboard shortcuts
- `PostForm.tsx` - Add auto-save, unsaved changes warning
- `ColumnsBlockPreview.tsx` - Fix React key prop warning (P1 bug)

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**Status**: N/A - No constitution violations. Project does not have an enforced constitution at this time.

If a constitution is established in the future and violations are identified, they will be documented here with justifications.
