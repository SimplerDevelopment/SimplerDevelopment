/**
 * Shared media library — drawn from sd-chat-mockup.html media tab.
 */

export type MediaKind = 'image' | 'video' | 'doc' | 'audio';

export type MediaItem = {
  id: string;
  kind: MediaKind;
  label: string;
  /** For images/videos: picsum seed used in the placeholder; for docs the ext. */
  seed?: string;
  ext?: string;
  color?: string;
  /** Optional pre-formatted duration ("0:42"). Used by audio + video. */
  duration?: string;
};

export type MediaFilter = {
  kind: MediaKind | 'all';
  label: string;
  /** Display-only count (matches the mockup). */
  count: string;
};

export const mediaFilters: MediaFilter[] = [
  { kind: 'all', label: 'All', count: '1,432' },
  { kind: 'image', label: 'Images', count: '892' },
  { kind: 'doc', label: 'Docs', count: '316' },
  { kind: 'video', label: 'Video', count: '147' },
  { kind: 'audio', label: 'Audio', count: '77' },
];

export const mediaItems: MediaItem[] = [
  { id: 'm-1', kind: 'image', seed: 'atlas-hero', label: 'atlas-hero-v2.jpg' },
  { id: 'm-2', kind: 'doc', ext: 'PDF', color: '#E11D48', label: 'Atlas-brand-spec.pdf' },
  { id: 'm-3', kind: 'video', seed: 'launch-film', label: '0:42 · Launch film', duration: '0:42' },
  { id: 'm-4', kind: 'image', seed: 'team-1', label: 'team-allhands.jpg' },
  { id: 'm-5', kind: 'image', seed: 'product-shot', label: 'product-hero.png' },
  { id: 'm-6', kind: 'doc', ext: 'DOCX', color: '#2563EB', label: 'Onboarding script.docx' },
  { id: 'm-7', kind: 'video', seed: 'demo-walk', label: '2:18 · Demo walk', duration: '2:18' },
  { id: 'm-8', kind: 'image', seed: 'pattern', label: 'pattern-bg-soft.png' },
  { id: 'm-9', kind: 'doc', ext: 'PDF', color: '#E11D48', label: 'Q2-nurture-flow.pdf' },
  { id: 'm-10', kind: 'audio', label: 'Sales sync · May 14', duration: '32:08' },
  { id: 'm-11', kind: 'image', seed: 'office', label: 'office-snapshot.jpg' },
  { id: 'm-12', kind: 'audio', label: 'Voice memo · roadmap', duration: '4:12' },
];
