# Quickstart: Block Editor UX Improvements

**Feature**: Block Editor UX Improvements
**Branch**: `001-block-editor-ux`
**Date**: 2026-01-27

## Prerequisites

- Node.js 18+ and npm
- Git
- Docker (for PostgreSQL)
- Code editor (VS Code recommended)

## Setup

### 1. Clone and Install

```bash
# Already on feature branch from /speckit.specify
git status
# Should show: On branch 001-block-editor-ux

# Install dependencies
npm install

# Install new dependencies for this feature
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install mousetrap
npm install immer
npm install unified remark-parse remark-html

# Install dev dependencies
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install --save-dev @playwright/test
npm install --save-dev @vitejs/plugin-react
npm install --save-dev jsdom
```

### 2. Configure Test Framework

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

Create `tests/setup.ts`:

```typescript
import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});
```

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3005',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3005',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 3. Update package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### 4. Environment Setup

```bash
# Copy .env.example to .env.local if not already done
cp .env.example .env.local

# Database should already be configured from existing setup
# Ensure PostgreSQL is running
docker-compose up -d postgres

# Run migrations if needed
npm run db:migrate
```

### 5. Start Development Server

```bash
npm run dev
```

Open http://localhost:3005 in your browser.

---

## Development Workflow

### Test-Driven Development (TDD)

Follow the Red-Green-Refactor cycle:

1. **Red**: Write a failing test
2. **Green**: Write minimal code to make it pass
3. **Refactor**: Clean up code while keeping tests green

**Example** - Implementing word count utility:

```bash
# 1. Create test file
touch tests/unit/wordCount.test.ts
```

```typescript
// tests/unit/wordCount.test.ts
import { describe, it, expect } from 'vitest';
import { countWords } from '@/lib/utils/wordCount';

describe('countWords', () => {
  it('counts words in simple text', () => {
    expect(countWords('hello world')).toBe(2);
  });

  it('handles multiple spaces', () => {
    expect(countWords('hello    world')).toBe(2);
  });

  it('handles empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('handles punctuation', () => {
    expect(countWords('hello, world!')).toBe(2);
  });
});
```

```bash
# 2. Run tests (should fail - RED)
npm test
```

```typescript
// 3. Implement function (GREEN)
// lib/utils/wordCount.ts
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .length;
}
```

```bash
# 4. Run tests (should pass - GREEN)
npm test

# 5. Refactor if needed (keep tests green)
```

### Component Testing Example

```typescript
// tests/integration/undoRedo.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisualBlockEditor } from '@/components/blocks/VisualBlockEditor';

describe('Undo/Redo', () => {
  it('undoes block deletion', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const initialBlocks = [
      { id: '1', type: 'text', content: 'Hello', order: 1 },
      { id: '2', type: 'text', content: 'World', order: 2 },
    ];

    render(
      <VisualBlockEditor
        blocks={initialBlocks}
        onChange={onChange}
      />
    );

    // Delete second block
    const deleteButton = screen.getAllByRole('button', { name: /delete/i })[1];
    await user.click(deleteButton);

    expect(onChange).toHaveBeenCalledWith([
      { id: '1', type: 'text', content: 'Hello', order: 1 },
    ]);

    // Undo deletion
    await user.keyboard('{Control>}z{/Control}');

    expect(onChange).toHaveBeenLastCalledWith(initialBlocks);
  });
});
```

### E2E Testing Example

```typescript
// tests/e2e/blockEditing.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Block Editor', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/admin/login');
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // Navigate to post editor
    await page.goto('/admin/posts/42/edit');
    await page.click('button:has-text("Content")');
  });

  test('adds new block with keyboard shortcut', async ({ page }) => {
    // Select first block
    await page.click('[data-block-id]');

    // Press Cmd+Enter to add new block
    await page.keyboard.press('Meta+Enter');

    // Verify new block was added
    const blocks = await page.$$('[data-block-id]');
    expect(blocks.length).toBeGreaterThan(1);
  });

  test('drags block to reorder', async ({ page }) => {
    const firstBlock = page.locator('[data-block-id]').first();
    const secondBlock = page.locator('[data-block-id]').nth(1);

    // Get initial positions
    const firstContent = await firstBlock.textContent();
    const secondContent = await secondBlock.textContent();

    // Drag second block to first position
    await secondBlock.dragTo(firstBlock);

    // Verify order changed
    const newFirstContent = await page.locator('[data-block-id]').first().textContent();
    expect(newFirstContent).toBe(secondContent);
  });

  test('shows word count', async ({ page }) => {
    // Type in a block
    await page.click('[data-block-type="text"]');
    await page.fill('[contenteditable]', 'This is a test with five words');

    // Check word count display
    const wordCount = page.locator('[data-testid="word-count"]');
    await expect(wordCount).toHaveText('5 words');
  });
});
```

---

## Project Structure

```
simplerdevelopment2026/
├── app/
│   └── admin/posts/[id]/edit/page.tsx
├── components/
│   ├── blocks/
│   │   ├── VisualBlockEditor.tsx       # Enhance with new features
│   │   ├── BlockEditor.tsx             # Classic editor
│   │   └── visual/
│   │       ├── ColumnsBlockPreview.tsx # Fix key prop bug here
│   │       └── ...
│   └── admin/
│       └── PostForm.tsx                # Add auto-save here
├── lib/
│   ├── utils/                          # NEW utilities
│   │   ├── blockHistory.ts             # Undo/redo logic
│   │   ├── richPaste.ts                # Paste parser
│   │   ├── wordCount.ts                # Content analysis
│   │   └── keyboardShortcuts.ts        # Shortcut definitions
│   └── hooks/                          # NEW hooks
│       ├── useBlockHistory.ts
│       ├── useBlockDragDrop.ts
│       └── useKeyboardShortcuts.ts
├── contexts/                           # NEW contexts
│   └── BlockEditorContext.tsx
├── types/
│   └── blocks.ts                       # Extend with new types
├── tests/                              # NEW test suite
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── setup.ts
├── specs/
│   └── 001-block-editor-ux/
│       ├── spec.md
│       ├── plan.md
│       ├── research.md
│       ├── data-model.md
│       ├── quickstart.md              # This file
│       └── contracts/
└── vitest.config.ts                   # NEW
```

---

## Implementation Order (Priority-Based)

### Phase 1: P1 Bugs & Core Features

1. **Fix React Key Prop Warning** (P1)
   ```bash
   # File: components/blocks/visual/ColumnsBlockPreview.tsx
   # Add key={`${block.id}-column-${index}`} to mapped columns
   ```

2. **Implement Undo/Redo** (P1)
   ```bash
   # 1. Create history utility
   touch lib/utils/blockHistory.ts
   touch lib/hooks/useBlockHistory.ts

   # 2. Write tests
   touch tests/unit/blockHistory.test.ts
   touch tests/integration/undoRedo.test.tsx

   # 3. Implement (TDD)
   npm test -- blockHistory
   ```

3. **Implement Drag-and-Drop** (P1)
   ```bash
   # 1. Install @dnd-kit
   npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

   # 2. Create hook
   touch lib/hooks/useBlockDragDrop.ts

   # 3. Write tests
   touch tests/integration/dragDrop.test.tsx

   # 4. Enhance VisualBlockEditor
   # File: components/blocks/VisualBlockEditor.tsx
   ```

### Phase 2: P2 Important Features

4. **Keyboard Shortcuts** (P2)
   ```bash
   # 1. Install mousetrap
   npm install mousetrap
   npm install --save-dev @types/mousetrap

   # 2. Create utilities
   touch lib/utils/keyboardShortcuts.ts
   touch lib/hooks/useKeyboardShortcuts.ts

   # 3. Write tests
   touch tests/integration/keyboardShortcuts.test.tsx
   ```

5. **Rich Content Paste** (P2)
   ```bash
   # 1. Install dependencies
   npm install unified remark-parse remark-html

   # 2. Create parser
   touch lib/utils/richPaste.ts

   # 3. Write tests
   touch tests/unit/richPaste.test.ts
   ```

6. **Preview Mode** (P2)
   ```bash
   # Add toggle to PostForm
   # Enhance VisualBlockEditor with preview state
   ```

### Phase 3: P3 Nice-to-Have Features

7. **Word/Character Count** (P3)
   ```bash
   touch lib/utils/wordCount.ts
   touch tests/unit/wordCount.test.ts
   ```

8. **Block Search** (P3)
   ```bash
   # Add search to block picker modal
   ```

9. **Block Collapse/Expand** (P3)
   ```bash
   # Add collapse state to blocks
   # Store in localStorage
   ```

---

## Testing Commands

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- wordCount

# Run tests with coverage
npm test:coverage

# Run E2E tests
npm test:e2e

# Run E2E tests with UI
npm test:e2e:ui
```

---

## Debugging

### VS Code Debug Configuration

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Next.js",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Vitest",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--run"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### Browser DevTools

```typescript
// Add debug flags to editor
const DEBUG = process.env.NODE_ENV === 'development';

if (DEBUG) {
  console.log('[BlockEditor] Current blocks:', blocks);
  console.log('[BlockEditor] History:', history.past.length, history.future.length);
}
```

---

## Common Issues

### Issue: Test fails with "Cannot find module"

**Solution**: Check import paths use `@/` alias
```typescript
// Wrong
import { countWords } from '../lib/utils/wordCount';

// Correct
import { countWords } from '@/lib/utils/wordCount';
```

### Issue: Drag-and-drop not working

**Solution**: Ensure DndContext wraps the editor
```tsx
<DndContext onDragEnd={handleDragEnd}>
  <SortableContext items={blockIds}>
    {blocks.map(block => <SortableBlock key={block.id} block={block} />)}
  </SortableContext>
</DndContext>
```

### Issue: Undo/redo skips steps

**Solution**: Verify history entries are created before state changes
```typescript
// Wrong
setBlocks(newBlocks);
history.push({ blocks: newBlocks, timestamp: Date.now() });

// Correct
history.push({ blocks, timestamp: Date.now() }); // Push CURRENT state
setBlocks(newBlocks); // Then update
```

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [React Testing Library](https://testing-library.com/react)
- [@dnd-kit Documentation](https://docs.dndkit.com/)
- [Mousetrap Documentation](https://craig.is/killing/mice)

---

## Next Steps

After setup is complete:

1. Fix React key prop bug (quick win)
2. Implement undo/redo with tests
3. Add drag-and-drop with tests
4. Continue with priority order

Remember: **Test First, Then Implement!**
