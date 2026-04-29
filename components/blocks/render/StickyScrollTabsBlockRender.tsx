'use client';

import { Block, StickyScrollTabsBlock } from '@/types/blocks';
import { useEffect, useRef, useState } from 'react';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { TextBlockRender } from './TextBlockRender';
import { HeadingBlockRender } from './HeadingBlockRender';
import { ImageBlockRender } from './ImageBlockRender';
import { ButtonBlockRender } from './ButtonBlockRender';
import { SpacerBlockRender } from './SpacerBlockRender';
import { DividerBlockRender } from './DividerBlockRender';
import { ColumnsBlockRender } from './ColumnsBlockRender';
import { SectionBlockRender } from './SectionBlockRender';
import { CardGridBlockRender } from './CardGridBlockRender';
import { AccordionBlockRender } from './AccordionBlockRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';

interface StickyScrollTabsBlockRenderProps {
  block: StickyScrollTabsBlock;
}

/**
 * Sticky scroll tabs renderer.
 *
 * Layout:
 *   - Outer wrapper has tall scroll height (panels.length * 100vh by default).
 *   - Inner sticky container holds the tabs row + panels stack.
 *   - Panels are absolute-positioned and overlap inside a relative container.
 *     Active panel: opacity 1, pointer-events auto. Inactive: opacity 0,
 *     pointer-events none.
 *   - Active index is derived from scroll progress through the outer wrapper,
 *     so as the user scrolls, the visible panel switches without the page
 *     jumping. Tab clicks scroll to the corresponding segment of the wrapper.
 */
export function StickyScrollTabsBlockRender({ block }: StickyScrollTabsBlockRenderProps) {
  const panels = block.panels ?? [];
  const [activeIndex, setActiveIndex] = useState(0);
  const outerRef = useRef<HTMLDivElement | null>(null);

  const stickyTop = block.stickyTopOffset ?? 80;
  const panelMinHeight = block.panelMinHeight ?? '60vh';
  const tabRadius = block.tabBorderRadius ?? '999px';
  const activeBg = block.activeTabBackground ?? '#A4D2A1';
  const activeFg = block.activeTabColor ?? '#0A3A5C';
  const inactiveBg = block.inactiveTabBackground ?? '#EAF3EC';
  const inactiveFg = block.inactiveTabColor ?? '#0A3A5C';
  // Mobile pill colors fall back to desktop colors when not explicitly set,
  // so existing instances don't change behavior. Postcaptain's home overrides
  // these to mint-green even though desktop uses white.
  const mobileActiveBg = block.mobileActiveTabBackground ?? activeBg;
  const mobileActiveFg = block.mobileActiveTabColor ?? activeFg;
  const mobileInactiveBg = block.mobileInactiveTabBackground ?? inactiveBg;
  const mobileInactiveFg = block.mobileInactiveTabColor ?? inactiveFg;
  const mobileTabsBehavior = block.mobileTabsBehavior ?? 'carousel';

  // Mobile: which tab pill is "active" by intersection observation.
  const [mobileActiveIndex, setMobileActiveIndex] = useState(0);
  const mobilePanelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const mobileTabStripRef = useRef<HTMLDivElement | null>(null);

  const handleMobileTabClick = (idx: number) => {
    const el = mobilePanelRefs.current[idx];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY - (stickyTop + 64);
    window.scrollTo({ top, behavior: 'smooth' });
  };

  // Track which mobile panel is in view, and auto-scroll the tab strip so the
  // active pill stays visible.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (panels.length === 0) return;
    if (mobileTabsBehavior !== 'carousel') return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const idx = Number((visible.target as HTMLElement).dataset.mobilePanelIndex ?? '0');
          setMobileActiveIndex(idx);
        }
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    mobilePanelRefs.current.forEach((el) => {
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [panels.length, mobileTabsBehavior]);

  // Auto-scroll mobile tab strip to keep the active pill in view.
  useEffect(() => {
    const strip = mobileTabStripRef.current;
    if (!strip) return;
    const activePill = strip.querySelector<HTMLElement>(
      `[data-mobile-tab-index="${mobileActiveIndex}"]`,
    );
    if (!activePill) return;
    const stripRect = strip.getBoundingClientRect();
    const pillRect = activePill.getBoundingClientRect();
    const desiredLeft =
      strip.scrollLeft + (pillRect.left - stripRect.left) - stripRect.width / 2 + pillRect.width / 2;
    strip.scrollTo({ left: Math.max(0, desiredLeft), behavior: 'smooth' });
  }, [mobileActiveIndex]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (panels.length === 0) return;

    const handle = () => {
      const el = outerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      if (total <= 0) {
        setActiveIndex(0);
        return;
      }
      // How far through the outer wrapper we've scrolled (0..1).
      const progress = Math.min(1, Math.max(0, -rect.top / total));
      // Pick a panel index from progress. We want the last panel to fill the
      // final segment, so map [0,1) into N evenly-sized buckets.
      const idx = Math.min(panels.length - 1, Math.floor(progress * panels.length));
      setActiveIndex(idx);
    };

    handle();
    window.addEventListener('scroll', handle, { passive: true });
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle);
      window.removeEventListener('resize', handle);
    };
  }, [panels.length]);

  const handleTabClick = (idx: number) => {
    const el = outerRef.current;
    if (!el) return;
    const total = el.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    // Scroll to the start of the bucket for this idx, plus a tiny nudge so the
    // computed progress lands inside the bucket (not on its boundary).
    const progressStart = idx / panels.length;
    const target =
      el.getBoundingClientRect().top +
      window.scrollY +
      total * progressStart +
      8;
    window.scrollTo({ top: target, behavior: 'smooth' });
  };

  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility,
      )
    : '';

  // Outer wrapper is tall enough that scrolling past it switches between every
  // panel. ~100vh per panel matches the live's "one screen per tab" feel.
  const outerHeight = `${Math.max(1, panels.length) * 100}vh`;

  return (
    <div className={`sticky-scroll-tabs ${responsiveClasses}`}>
      {(block.overline || block.title || block.description) && (
        <div className="ssct-header" style={getElementCSS(block.elementStyles, 'header')}>
          {block.overline && (
            <div
              className="ssct-overline"
              style={getElementCSS(block.elementStyles, 'overline')}
              dangerouslySetInnerHTML={{ __html: block.overline }}
            />
          )}
          {block.title && (
            <h2
              className="ssct-title"
              style={getElementCSS(block.elementStyles, 'title')}
              dangerouslySetInnerHTML={{ __html: block.title }}
            />
          )}
          {block.description && (
            <p
              className="ssct-description"
              style={getElementCSS(block.elementStyles, 'description')}
              dangerouslySetInnerHTML={{ __html: block.description }}
            />
          )}
        </div>
      )}

      {/* Mobile-only horizontal-scroll tab strip. Hidden on desktop via CSS.
          Sticks to the top of the viewport once scrolled into the section,
          tapping a pill scrolls to its panel. */}
      {mobileTabsBehavior === 'carousel' && panels.length > 0 && (
        <div
          ref={mobileTabStripRef}
          className="ssct-mobile-tabs"
          role="tablist"
          aria-label="Section tabs"
          style={{
            display: 'none', // toggled to flex on mobile via CSS
            position: 'sticky',
            top: `${stickyTop}px`,
            zIndex: 5,
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            gap: '8px',
            padding: '12px 16px',
            background: 'var(--ssct-mobile-strip-bg, rgba(255,255,255,0.96))',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            margin: '0 -16px 8px',
          }}
        >
          {panels.map((p, i) => {
            const isActive = i === mobileActiveIndex;
            return (
              <button
                key={`m-${p.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-mobile-tab-index={i}
                onClick={() => handleMobileTabClick(i)}
                className="ssct-mobile-tab"
                style={{
                  flex: '0 0 auto',
                  scrollSnapAlign: 'center',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: tabRadius,
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? mobileActiveBg : mobileInactiveBg,
                  color: isActive ? mobileActiveFg : mobileInactiveFg,
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.2s ease, color 0.2s ease',
                }}
              >
                {p.icon && (
                  <span
                    className="material-icons"
                    aria-hidden="true"
                    style={{ fontSize: '1.2em', lineHeight: 1 }}
                  >
                    {p.icon}
                  </span>
                )}
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Outer scroll wrapper — gives the page enough scroll-height that the
          sticky section can iterate through every panel as the user scrolls. */}
      <div
        ref={outerRef}
        className="ssct-scroll-outer"
        style={{ position: 'relative', minHeight: outerHeight }}
      >
        {/* Sticky stage — holds tabs + the absolutely-stacked panel canvas. */}
        <div
          className="ssct-stage"
          style={{
            position: 'sticky',
            top: `${stickyTop}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* Tab pill row */}
          <div
            className="ssct-tabs"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${panels.length}, minmax(0, 1fr))`,
              gap: '12px',
              ...getElementCSS(block.elementStyles, 'tabsRow'),
            }}
          >
            {panels.map((p, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleTabClick(i)}
                  aria-pressed={isActive}
                  className="ssct-tab"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '16px 24px',
                    borderRadius: tabRadius,
                    border: 'none',
                    cursor: 'pointer',
                    background: isActive ? activeBg : inactiveBg,
                    color: isActive ? activeFg : inactiveFg,
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    transition: 'background 0.25s ease, color 0.25s ease',
                    ...getElementCSS(block.elementStyles, isActive ? 'activeTab' : 'tab'),
                  }}
                >
                  {p.icon && (
                    <span
                      className="material-icons ssct-tab-icon"
                      aria-hidden="true"
                      style={{ fontSize: '1.4em', lineHeight: 1 }}
                    >
                      {p.icon}
                    </span>
                  )}
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Panel canvas — relative, with absolute-positioned overlapping panels. */}
          <div
            className="ssct-panels"
            style={{ position: 'relative', minHeight: panelMinHeight }}
          >
            {panels.map((p, i) => {
              const isActive = i === activeIndex;
              return (
                <div
                  key={p.id}
                  ref={(el) => {
                    mobilePanelRefs.current[i] = el;
                  }}
                  data-panel-index={i}
                  data-panel-id={p.id}
                  data-mobile-panel-index={i}
                  className={`ssct-panel ${isActive ? 'is-active' : ''}`}
                  aria-hidden={!isActive}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    minHeight: panelMinHeight,
                    opacity: isActive ? 1 : 0,
                    visibility: isActive ? 'visible' : 'hidden',
                    pointerEvents: isActive ? 'auto' : 'none',
                    transition: 'opacity 0.4s ease',
                    padding: '32px 0',
                    ...getElementCSS(block.elementStyles, 'panel'),
                    ...(isActive ? getElementCSS(block.elementStyles, 'activePanel') : undefined),
                  }}
                >
                  {(p.blocks ?? []).map((nested) => (
                    <div key={nested.id}>
                      <BlockStyleWrapper block={nested}>{renderNestedBlock(nested)}</BlockStyleWrapper>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderNestedBlock(block: Block) {
  switch (block.type) {
    case 'text':
      return <TextBlockRender block={block} />;
    case 'heading':
      return <HeadingBlockRender block={block} />;
    case 'image':
      return <ImageBlockRender block={block} />;
    case 'button':
      return <ButtonBlockRender block={block} />;
    case 'spacer':
      return <SpacerBlockRender block={block} />;
    case 'divider':
      return <DividerBlockRender block={block} />;
    case 'columns':
      return <ColumnsBlockRender block={block} />;
    case 'section':
      return <SectionBlockRender block={block} />;
    case 'card-grid':
      return <CardGridBlockRender block={block} />;
    case 'accordion':
      return <AccordionBlockRender block={block} />;
    default:
      return null;
  }
}
