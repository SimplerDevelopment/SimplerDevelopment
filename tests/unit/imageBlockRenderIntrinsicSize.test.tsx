/**
 * ImageBlockRender CLS reservation.
 *
 * The image block used to emit `<img src className="w-full h-auto">` with no
 * intrinsic size, so the browser could not reserve the box and every image
 * cost a layout shift. `media` already stores width/height (extracted with
 * sharp on upload); the pick path just dropped them.
 *
 * The emission is conditional — unknown or partial dimensions must fall back
 * to the old attribute-less output rather than guess a ratio and crop the
 * image. That conditional is the thing worth pinning.
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ImageBlockRender } from '@/components/blocks/render/ImageBlockRender';
import type { ImageBlock } from '@/types/blocks';

const base: ImageBlock = {
  id: 'img-1',
  type: 'image',
  url: 'https://example.test/photo.jpg',
  alt: 'A photo',
};

function renderImg(block: ImageBlock) {
  const { container } = render(<ImageBlockRender block={block} />);
  return container.querySelector('img');
}

describe('ImageBlockRender intrinsic size', () => {
  it('reserves space when both dimensions are known', () => {
    const img = renderImg({ ...base, naturalWidth: 1600, naturalHeight: 900 });
    expect(img).not.toBeNull();
    expect(img!.getAttribute('width')).toBe('1600');
    expect(img!.getAttribute('height')).toBe('900');
    expect(img!.style.aspectRatio).toBe('1600 / 900');
  });

  it('omits dimensions entirely when unknown (external URL, legacy block)', () => {
    const img = renderImg(base);
    expect(img).not.toBeNull();
    expect(img!.getAttribute('width')).toBeNull();
    expect(img!.getAttribute('height')).toBeNull();
    expect(img!.style.aspectRatio).toBe('');
  });

  it.each([
    ['width only', { naturalWidth: 1600 }],
    ['height only', { naturalHeight: 900 }],
    ['zero width', { naturalWidth: 0, naturalHeight: 900 }],
    ['zero height', { naturalWidth: 1600, naturalHeight: 0 }],
  ])('does not emit a degenerate ratio: %s', (_label, dims) => {
    const img = renderImg({ ...base, ...dims });
    expect(img!.getAttribute('width')).toBeNull();
    expect(img!.style.aspectRatio).toBe('');
  });

  it('always sets async decoding and lazy loading', () => {
    const img = renderImg({ ...base, naturalWidth: 800, naturalHeight: 600 });
    expect(img!.getAttribute('decoding')).toBe('async');
    // LCP candidates are handled by <HeroPreload>, which preloads the first
    // content images at high priority — so lazy here is safe and matches the
    // existing convention documented in HeroPreload.tsx.
    expect(img!.getAttribute('loading')).toBe('lazy');
  });
});
