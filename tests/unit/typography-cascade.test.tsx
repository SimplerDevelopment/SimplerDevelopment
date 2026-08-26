// @vitest-environment jsdom
/**
 * Unit tests for VEQA-032 step 1 — the typography cascade context + resolver
 * hook (components/blocks/render/typography-cascade.tsx).
 *
 * Strategy:
 *   - `resolveTypography` is pure (no React) — exercised directly per
 *     property to prove the precedence order: own > elementStyles >
 *     ancestor > none.
 *   - `TypographyCascadeProvider` nesting/merging is exercised by mounting a
 *     real tree (`render` from @testing-library/react) with a small
 *     `useResolvedTypography` leaf probe, since context values only flow
 *     through an actual component tree.
 *   - Memoization is checked by capturing the raw `TypographyCascadeContext`
 *     value across a `rerender` that passes a fresh `own` object with
 *     identical primitive fields, and asserting the captured object
 *     reference is unchanged (i.e. `useMemo` did not recompute).
 */

import { describe, it, expect } from 'vitest';
import { useContext } from 'react';
import { render, screen } from '@testing-library/react';
import {
  resolveTypography,
  TypographyCascadeContext,
  TypographyCascadeProvider,
  useResolvedTypography,
  TYPOGRAPHY_PROPERTIES,
  type TypographyValues,
} from '@/components/blocks/render/typography-cascade';

describe('resolveTypography (pure resolver)', () => {
  it('own explicit value wins over elementStyles, ancestor, and none', () => {
    for (const prop of TYPOGRAPHY_PROPERTIES) {
      const own: TypographyValues = { [prop]: 'own-value' };
      const elementStyles: TypographyValues = { [prop]: 'element-value' };
      const inherited: TypographyValues = { [prop]: 'ancestor-value' };

      const resolved = resolveTypography(own, elementStyles, inherited);

      expect(resolved[prop]).toEqual({ value: 'own-value', source: 'own' });
    }
  });

  it('elementStyles wins over ancestor and none when own is unset', () => {
    for (const prop of TYPOGRAPHY_PROPERTIES) {
      const elementStyles: TypographyValues = { [prop]: 'element-value' };
      const inherited: TypographyValues = { [prop]: 'ancestor-value' };

      const resolved = resolveTypography(undefined, elementStyles, inherited);

      expect(resolved[prop]).toEqual({ value: 'element-value', source: 'elementStyles' });
    }
  });

  it('nearest ancestor wins over none when own and elementStyles are unset', () => {
    for (const prop of TYPOGRAPHY_PROPERTIES) {
      const inherited: TypographyValues = { [prop]: 'ancestor-value' };

      const resolved = resolveTypography(undefined, undefined, inherited);

      expect(resolved[prop]).toEqual({ value: 'ancestor-value', source: 'ancestor' });
    }
  });

  it('resolves to "none" with an undefined value when nothing is set anywhere', () => {
    const resolved = resolveTypography(undefined, undefined, undefined);

    for (const prop of TYPOGRAPHY_PROPERTIES) {
      expect(resolved[prop]).toEqual({ value: undefined, source: 'none' });
    }
  });

  it('an own value present on one property does not affect resolution of other properties', () => {
    const own: TypographyValues = { color: 'own-red' };
    const inherited: TypographyValues = { color: 'ancestor-blue', fontSize: 'ancestor-20px' };

    const resolved = resolveTypography(own, undefined, inherited);

    expect(resolved.color).toEqual({ value: 'own-red', source: 'own' });
    expect(resolved.fontSize).toEqual({ value: 'ancestor-20px', source: 'ancestor' });
  });
});

/** Renders `useResolvedTypography` for a block with no own style, so the
 *  resolved value reflects only the elementStyles slot + whatever is
 *  inherited from context — used to probe provider merging. */
function Leaf({
  testId,
  elementKey,
  elementStyles,
}: {
  testId: string;
  elementKey?: string;
  elementStyles?: Record<string, TypographyValues>;
}) {
  const resolved = useResolvedTypography({ elementStyles }, elementKey);
  return (
    <div data-testid={testId}>
      {`color=${resolved.color.value ?? 'undefined'}(${resolved.color.source}) ` +
        `fontSize=${resolved.fontSize.value ?? 'undefined'}(${resolved.fontSize.source})`}
    </div>
  );
}

describe('TypographyCascadeProvider merging', () => {
  it('nested section -> column -> leaf resolves the innermost ancestor value', () => {
    render(
      <TypographyCascadeProvider own={{ color: 'section-red', fontSize: 'section-16px' }}>
        <TypographyCascadeProvider own={{ fontSize: 'column-20px' }}>
          <Leaf testId="leaf" />
        </TypographyCascadeProvider>
      </TypographyCascadeProvider>
    );

    // fontSize was set by BOTH ancestors — the leaf must see the innermost
    // (column) provider's value, not the outer section's.
    expect(screen.getByTestId('leaf').textContent).toContain('fontSize=column-20px(ancestor)');
  });

  it('an outer value survives when the inner provider does not set it', () => {
    render(
      <TypographyCascadeProvider own={{ color: 'section-red', fontSize: 'section-16px' }}>
        <TypographyCascadeProvider own={{ fontSize: 'column-20px' }}>
          <Leaf testId="leaf" />
        </TypographyCascadeProvider>
      </TypographyCascadeProvider>
    );

    // color was only set by the OUTER section provider; the inner column
    // provider leaves it unset, so it must still reach the leaf.
    expect(screen.getByTestId('leaf').textContent).toContain('color=section-red(ancestor)');
  });

  it('a leaf outside any provider sees no ancestor typography', () => {
    render(<Leaf testId="leaf" />);

    expect(screen.getByTestId('leaf').textContent).toBe(
      'color=undefined(none) fontSize=undefined(none)'
    );
  });

  it("elementStyles on the leaf itself wins over an ancestor's value", () => {
    render(
      <TypographyCascadeProvider own={{ color: 'section-red' }}>
        <Leaf testId="leaf" elementKey="quoteText" elementStyles={{ quoteText: { color: 'leaf-own-blue' } }} />
      </TypographyCascadeProvider>
    );

    expect(screen.getByTestId('leaf').textContent).toContain('color=leaf-own-blue(elementStyles)');
  });
});

describe('TypographyCascadeProvider memoization', () => {
  it('same inherited context + equal own field values -> same context object identity', () => {
    const seen: TypographyValues[] = [];

    function ContextProbe() {
      const ctx = useContext(TypographyCascadeContext);
      seen.push(ctx);
      return null;
    }

    const { rerender } = render(
      <TypographyCascadeProvider own={{ color: 'blue' }}>
        <ContextProbe />
      </TypographyCascadeProvider>
    );

    // Re-render with a BRAND NEW `own` object literal but identical primitive
    // fields — this is the realistic case (a container recomputing its style
    // object every render). The provider must not fan out a new context
    // identity when nothing actually changed.
    rerender(
      <TypographyCascadeProvider own={{ color: 'blue' }}>
        <ContextProbe />
      </TypographyCascadeProvider>
    );

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it('a changed own field value produces a NEW context object', () => {
    const seen: TypographyValues[] = [];

    function ContextProbe() {
      const ctx = useContext(TypographyCascadeContext);
      seen.push(ctx);
      return null;
    }

    const { rerender } = render(
      <TypographyCascadeProvider own={{ color: 'blue' }}>
        <ContextProbe />
      </TypographyCascadeProvider>
    );

    rerender(
      <TypographyCascadeProvider own={{ color: 'green' }}>
        <ContextProbe />
      </TypographyCascadeProvider>
    );

    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[1].color).toBe('green');
  });
});
