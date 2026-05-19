// Shared types for the magamommy autonomous-shop pipeline.
//
//   researcher → Topic[]               (mined from the news, persisted to magamommy_briefs)
//   concept-writer → Concept           (picks one Topic, writes a shirt concept → magamommy_concepts)
//   designer → DesignerResult          (renders artwork, returns S3 mockup + design row)
//   publisher → PipelineDrop           (orchestrator state — magamommy_drops row mirror)
//
// All four agent files import from here so the contract stays consistent.

/**
 * A single trending political talking-point harvested by the researcher.
 * One brief carries 3 of these.
 */
export interface Topic {
  /** kebab-case, <= 60 chars, derived from headline. Stable id within a brief. */
  slug: string;
  /** <= 120 chars, the central claim. */
  headline: string;
  /** 2-3 sentences explaining why this is in the news right now. */
  context: string;
  /** 1-5 URLs the model cited via web_search. */
  sourceUrls: string[];
}

/**
 * A shirt concept produced by the concept-writer from a chosen Topic.
 * Mirrors the persisted shape in magamommy_concepts.
 */
export interface Concept {
  /** kebab-case slug of the source Topic. */
  topicSlug: string;
  /** <= 120 chars, the front-of-shirt slogan. */
  slogan: string;
  /** Longer-form positioning / supporting line. */
  tagline: string;
  /** Prompt fed to the designer for the artwork render. */
  visualPrompt: string;
  /** Named colour palette for the design. */
  palette: Array<{ name: string; hex: string }>;
  /** 'front' | 'back' — where the print sits on the garment. */
  placement: 'front' | 'back';
  /** 'bold' | 'satire' | 'classic' — informs the designer's stylistic choices. */
  style: 'bold' | 'satire' | 'classic';
  /** Rejected alternatives kept as an audit trail. */
  alternatives: Array<{
    slogan: string;
    visualPrompt: string;
    rejectionReason?: string;
  }>;
}

/**
 * The designer's hand-off to the publisher.
 * `designId` is the FK into the existing `designs` table.
 */
export interface DesignerResult {
  /** UUID of the persisted designs row. */
  designId: string;
  /** S3 URL of the raw print-ready artwork (transparent PNG). */
  artworkUrl: string;
  /** S3 URL of the composited front mockup (artwork stamped on shirt). */
  frontMockupUrl: string;
  /** S3 URL of the composited back mockup — only populated when placement === 'back'. */
  backMockupUrl?: string;
}

/**
 * Orchestrator state row — one per Monday cron firing per site.
 * Mirrors the magamommy_drops table; agents read/write through the runner,
 * but the shape is shared here so each agent can type its slice.
 */
export interface PipelineDrop {
  id: number;
  websiteId: number;
  /** YYYY-MM-DD, Monday of the drop week in UTC. */
  weekOf: string;
  status:
    | 'pending'
    | 'researching'
    | 'concepting'
    | 'designing'
    | 'publishing'
    | 'live'
    | 'failed';
  briefId: number | null;
  conceptId: number | null;
  designId: string | null;
  productId: number | null;
  error: string | null;
  errorStage: string | null;
}
