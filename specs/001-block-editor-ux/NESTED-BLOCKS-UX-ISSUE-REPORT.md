# Nested Blocks Selection UX Issue Report

**Date:** 2026-01-27
**Issue:** Nested blocks are difficult to select
**Test Environment:** Dev server (http://localhost:3002)
**Test Method:** Playwright MCP browser automation + User feedback
**Reporter:** User feedback during testing session
**Tester:** Claude (Sonnet 4.5)

---

## Summary

**Critical UX Issue:** When users click on a nested block (e.g., an image inside a Columns block), the **parent container block gets selected** instead of the nested block itself. This makes it extremely difficult to edit, configure, or manipulate individual nested blocks.

**Severity:** **HIGH** - Significantly impacts usability for complex layouts
**Impact:** Users cannot easily work with nested content structures
**Status:** ⚠️ **BLOCKING FOR MVP** - Should be fixed before production launch

---

## Issue Description

### What Happens:
1. User clicks on a nested block (e.g., Image block inside Columns block)
2. Instead of selecting the Image block, the parent Columns block is selected
3. User cannot access the nested block's settings or toolbar
4. User must use workarounds to edit nested content

### Expected Behavior:
1. User clicks on a nested block
2. The nested block is selected and highlighted
3. Nested block's toolbar and settings panel appear
4. User can edit, move, or delete the nested block

### Actual Behavior:
1. User clicks on a nested block
2. Parent container block is selected
3. Parent block's toolbar appears instead
4. Nested block remains unselectable by direct click

---

## Reproduction Steps

1. Navigate to `/admin/posts/42/edit`
2. Click Content tab to open block editor
3. Scroll to any Columns block containing nested content
4. Click on an image (or other block) inside the Columns block
5. Observe: Parent Columns block gets selected, not the image

---

## Test Evidence

### Test Case: Click Nested Image in Columns Block

**Setup:**
- Columns block at ref=e577
- Contains image block at ref=e593
- Image has text: "Team of developers and designers..."

**Actions:**
```javascript
// Clicked on nested image
await page.getByRole('img', { name: 'Team of developers and' }).first().click();
```

**Result:** ❌ **FAILED** - Parent Columns block selected instead

**Snapshot Evidence:**
```yaml
- generic [ref=e577]:  # <-- Columns block SELECTED
  - generic [ref=e845]:  # <-- Toolbar appears for parent
    - button "Move up"
    - button "Move down"
    - button "Duplicate"
    - button "Delete"
  - generic [ref=e580]:  # <-- Actual content with nested image
    - img [ref=e593]  # <-- Image that was clicked (NOT selected)
```

**Analysis:**
- Clicking ref=e593 (image) selected ref=e577 (parent Columns block)
- Image block did NOT receive selection
- Columns block toolbar appeared instead of image toolbar

---

## Affected Block Types

This issue likely affects **all container blocks with nested content:**

### Confirmed Affected:
- ✅ **Columns block** (tested) - Cannot select nested images, paragraphs, etc.

### Likely Affected (not tested):
- ⚠️ **Accordion blocks** - Nested content in panels
- ⚠️ **Tabs blocks** - Content within tab panels
- ⚠️ **Card blocks** - Nested headers, bodies, footers
- ⚠️ **Section blocks** - Any nested layout containers
- ⚠️ **Group blocks** - Generic containers with nested blocks

### Complexity:
- **2+ levels of nesting:** Even worse
  - Example: Image → Columns → Section → Page
  - Clicking image might select Section or Columns, unpredictable

---

## User Impact

### Impact on Workflows:

1. **Cannot Edit Nested Images:**
   - Users want to change image source, alt text, caption
   - Click on image → parent selected instead
   - Must find alternative way to select image

2. **Cannot Rearrange Nested Blocks:**
   - Users want to move image up/down within columns
   - Move up/down buttons affect parent Columns block, not image
   - Cannot reorder nested content

3. **Cannot Delete Nested Blocks:**
   - Users want to remove specific image from column
   - Delete button deletes entire Columns block
   - Loses all content in all columns

4. **Cannot Access Nested Settings:**
   - Users want to configure nested block properties
   - Settings panel shows parent block settings
   - Nested block settings inaccessible

### Workarounds:

Users might try:
1. **Double-click** on nested block (not tested - may not work)
2. **Click block outline/border** instead of content (difficult to target)
3. **Use block hierarchy navigator** (if exists - not verified)
4. **Edit in Classic mode** and switch back (loses WYSIWYG benefit)
5. **Delete and recreate** nested content (very frustrating)

**Problem:** None of these workarounds are intuitive or documented

---

## Root Cause Analysis

### Possible Technical Causes:

1. **Event Propagation Issue:**
   - Click event on nested block bubbles up to parent
   - Parent block's click handler fires instead
   - Nested block's click handler never reached

2. **Z-Index / Layer Stacking:**
   - Parent block's interactive layer above nested blocks
   - Nested blocks are visually present but not interactive
   - Clicks hit parent's layer first

3. **Selection Logic:**
   - Editor only tracks one "selected block" at a time
   - Parent-child relationship not considered in selection
   - Clicking nested block incorrectly selects parent

4. **Click Target Detection:**
   - Click handler checks `event.target` incorrectly
   - Determines "closest block" instead of "exact block"
   - Always resolves to parent container

### Code Locations to Investigate:

- `components/blocks/VisualBlockEditor.tsx` - Block click handlers
- `components/blocks/visual/ColumnsBlock.tsx` - Columns block interaction
- Selection state management hooks
- Block focus/selection utilities

---

## Recommended Fixes

### Priority 1: Immediate Fix (P0 - Blocking MVP)

**Option A: Prevent Event Propagation**
```typescript
// In nested block click handler
const handleNestedBlockClick = (e: React.MouseEvent, blockId: string) => {
  e.stopPropagation(); // Prevent parent from receiving click
  selectBlock(blockId);
};
```

**Pros:**
- Simple, targeted fix
- Minimal code changes

**Cons:**
- Must add to every nested block type
- Doesn't solve multi-level nesting

**Option B: Smart Selection Logic**
```typescript
// In editor click handler
const handleBlockClick = (e: React.MouseEvent) => {
  const clickedElement = e.target as HTMLElement;
  const closestBlock = findClosestBlockElement(clickedElement);

  // Find the INNERMOST block, not outermost
  const innermostBlock = findInnermostBlock(closestBlock);
  selectBlock(innermostBlock.id);
};
```

**Pros:**
- Solves issue for all block types
- Handles multi-level nesting

**Cons:**
- More complex logic
- Requires refactoring

**Recommendation:** **Implement Option A first** (quick fix), then **Option B** (proper solution) in P1.

---

### Priority 2: Enhanced Nested Block UX (P1)

1. **Visual Indicators:**
   - Show nested block outlines on hover
   - Highlight clickable area of nested blocks
   - Display nesting level in breadcrumb

2. **Block Navigator:**
   - Add tree view of block hierarchy
   - Click in navigator to select any nested block
   - Show parent-child relationships visually

3. **Keyboard Navigation:**
   - Arrow keys to navigate between nested blocks
   - Tab to enter/exit nested context
   - Escape to select parent block

4. **Context Menu:**
   - Right-click on nested block to show options
   - "Select parent" option
   - "Select child" submenu

---

### Priority 3: Advanced Features (P2)

1. **Click-through Mode:**
   - Hold modifier key (Cmd/Ctrl) to click through to nested blocks
   - Multiple clicks descend through nesting levels
   - Visual feedback for nesting depth

2. **Isolation Mode:**
   - "Edit in isolation" button for nested blocks
   - Temporarily shows only nested block with its children
   - Exit to return to full view

3. **Drag-and-Drop Nesting:**
   - Drag blocks into containers
   - Drop indicators show nesting depth
   - Auto-adjust parent block layout

---

## Testing Recommendations

### Immediate Testing (P0):

1. **Verify fix works:**
   - Click nested image in Columns block → image selected ✅
   - Settings panel shows image settings ✅
   - Toolbar shows image controls ✅

2. **Test all nested scenarios:**
   - Image in Columns
   - Paragraph in Columns
   - Heading in Columns
   - Multiple levels of nesting

3. **Regression testing:**
   - Ensure parent blocks still selectable by clicking empty areas
   - Verify toolbar buttons work correctly
   - Check selection state persistence

### Automated Tests (P1):

```typescript
describe('Nested Block Selection', () => {
  it('should select nested image when clicked', () => {
    // Arrange
    const columnsBlock = createColumnsBlock();
    const nestedImage = createImageBlock();
    columnsBlock.addNestedBlock(nestedImage);

    // Act
    click(nestedImage);

    // Assert
    expect(selectedBlock).toBe(nestedImage);
    expect(selectedBlock).not.toBe(columnsBlock);
  });

  it('should select parent when clicking empty area', () => {
    // Arrange
    const columnsBlock = createColumnsBlock();
    const emptyArea = getEmptyAreaOfBlock(columnsBlock);

    // Act
    click(emptyArea);

    // Assert
    expect(selectedBlock).toBe(columnsBlock);
  });

  it('should handle multi-level nesting', () => {
    // Section > Columns > Image
    const section = createSectionBlock();
    const columns = createColumnsBlock();
    const image = createImageBlock();

    section.addNestedBlock(columns);
    columns.addNestedBlock(image);

    // Act
    click(image);

    // Assert
    expect(selectedBlock).toBe(image);
    expect(selectedBlock).not.toBe(columns);
    expect(selectedBlock).not.toBe(section);
  });
});
```

---

## User Feedback

**Original Report:**
> "Blocks inside blocks are not easy to select"

**Context:**
- User was testing block editor with Playwright MCP
- Encountered issue while working with complex layouts
- Reported during live testing session on 2026-01-27

**User Experience Rating:** ⭐⭐ (2/5) - Frustrating, blocks feel broken

---

## Related Issues

**Known Issues:**
- React key console error (separate issue, documented)
- Drag-and-drop not implemented (would help with nested blocks)
- Block picker incomplete (limits nested block types available)

**Potential Conflicts:**
- This fix might interact with drag-and-drop implementation
- Selection logic changes could affect undo/redo
- Event propagation changes might impact keyboard shortcuts

---

## Success Criteria

### Fix is Complete When:

1. ✅ Clicking nested block selects nested block (not parent)
2. ✅ Nested block toolbar appears
3. ✅ Nested block settings panel appears
4. ✅ Move up/down buttons affect nested block
5. ✅ Delete button deletes nested block (not parent)
6. ✅ Parent block still selectable by clicking empty areas
7. ✅ Works for all nested block types
8. ✅ Handles multi-level nesting (3+ levels)
9. ✅ No regression in other selection behaviors
10. ✅ Performance not impacted (< 50ms selection time)

### Acceptance Testing:

**Manual Test Scenarios:**
1. User clicks nested image → image selected ✅
2. User clicks nested paragraph → paragraph selected ✅
3. User clicks empty column area → columns block selected ✅
4. User deletes nested image → only image removed ✅
5. User moves nested block up → block moves within parent ✅

---

## Priority Assessment

**Why This is P0 (Blocking MVP):**

1. **Core Functionality Broken:**
   - Users cannot edit nested content
   - Affects all complex layouts
   - Makes Columns blocks nearly unusable

2. **User Expectation:**
   - Basic expectation: click = select
   - Current behavior is surprising and frustrating
   - Users will think editor is buggy

3. **Competitive Disadvantage:**
   - WordPress Gutenberg handles this correctly
   - Notion handles nested blocks well
   - Users comparing editors will notice immediately

4. **Workarounds Inadequate:**
   - No good workaround exists
   - Forces users to avoid nested layouts
   - Limits editor's usefulness significantly

**Estimated Fix Time:** 2-4 hours (Option A), 6-8 hours (Option B)

**Recommendation:** **Fix Option A immediately**, ship MVP, then implement Option B in P1 for robust solution.

---

## Conclusion

This is a **critical UX issue** that significantly impacts the block editor's usability. While the editor's core features (undo/redo, preview, reordering) work well, the inability to select nested blocks makes complex layouts frustrating to work with.

**Status:** ⚠️ **BLOCKING FOR MVP**
**Priority:** **P0** - Must fix before production launch
**Estimated Impact:** High - Affects all users working with layouts
**Estimated Effort:** 2-4 hours (quick fix), 6-8 hours (proper solution)

**Recommendation:** Implement event propagation fix (Option A) immediately to unblock MVP launch, then schedule proper selection logic refactor (Option B) for P1 release.

---

**Test Report By:** Claude (Sonnet 4.5)
**User Feedback From:** Testing session participant
**Status:** Issue confirmed and documented - requires immediate fix
