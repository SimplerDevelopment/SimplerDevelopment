import { describe, it, expect } from 'vitest';
import { wrapIndex } from '@/components/blocks/render/SurveyMediaCarousel';
import { deriveMediaKind, hasMediaItems, hasRequired } from '@/components/admin/SurveyBuilder.constants';
import { DISPLAY_ONLY_TYPES } from '@/components/blocks/render/SurveyFormInline.types';

// PUX-028: media-carousel survey field type — slide-navigation wraparound,
// mixed image/video kind detection, and the field-type exclusion lists that
// keep a display-only carousel out of required-field validation, question
// numbering, export, and result aggregation.

describe('SurveyMediaCarousel wrapIndex', () => {
  it('wraps forward past the last slide back to the first', () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(4, 3)).toBe(1);
  });

  it('wraps backward past the first slide to the last (Previous from slide 0)', () => {
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-4, 3)).toBe(2);
  });

  it('is a no-op inside range', () => {
    expect(wrapIndex(0, 5)).toBe(0);
    expect(wrapIndex(2, 5)).toBe(2);
  });

  it('never throws or divides by zero for an empty list', () => {
    expect(wrapIndex(0, 0)).toBe(0);
    expect(wrapIndex(5, 0)).toBe(0);
  });
});

describe('deriveMediaKind (mixed image/video slide list)', () => {
  it('classifies any video/* mimeType as a video slide', () => {
    expect(deriveMediaKind('video/mp4')).toBe('video');
    expect(deriveMediaKind('video/quicktime')).toBe('video');
  });

  it('classifies image/* mimeType as an image slide', () => {
    expect(deriveMediaKind('image/png')).toBe('image');
    expect(deriveMediaKind('image/jpeg')).toBe('image');
  });

  it('falls back to image for missing/unknown mimeType rather than throwing', () => {
    expect(deriveMediaKind(undefined)).toBe('image');
    expect(deriveMediaKind(null)).toBe('image');
    expect(deriveMediaKind('')).toBe('image');
    expect(deriveMediaKind('application/pdf')).toBe('image');
  });
});

describe('media-carousel field-type exclusions (lockstep with image/video)', () => {
  it('is display-only — excluded from question numbering/progress/validation like image/video', () => {
    expect(DISPLAY_ONLY_TYPES.has('media-carousel')).toBe(true);
    expect(DISPLAY_ONLY_TYPES.has('image')).toBe(true);
    expect(DISPLAY_ONLY_TYPES.has('video')).toBe(true);
  });

  it('can never be marked required in the builder, matching image/video', () => {
    expect(hasRequired('media-carousel')).toBe(false);
    expect(hasRequired('image')).toBe(false);
    expect(hasRequired('video')).toBe(false);
    // Sanity: a normal input type is still required-eligible.
    expect(hasRequired('text')).toBe(true);
  });

  it('is the only field type flagged as carrying an ordered mediaItems list', () => {
    expect(hasMediaItems('media-carousel')).toBe(true);
    expect(hasMediaItems('image')).toBe(false);
    expect(hasMediaItems('text')).toBe(false);
  });
});
