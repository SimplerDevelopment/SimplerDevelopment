import { describe, it, expect } from 'vitest';
import { getBlockIcon, getBlockTypeMetadata, BLOCK_TYPES, BLOCK_ICONS } from '@/lib/utils/blockIcons';
import { BlockType } from '@/types/blocks';

describe('Block Icons Utility', () => {
  describe('BLOCK_ICONS', () => {
    it('has icons defined for common block types', () => {
      const commonTypes: BlockType[] = ['heading', 'text', 'image', 'button'];
      commonTypes.forEach(type => {
        expect(BLOCK_ICONS[type]).toBeDefined();
        // Lucide icons are objects (React components)
        expect(typeof BLOCK_ICONS[type]).toBe('object');
      });
    });
  });

  describe('getBlockIcon', () => {
    it('returns correct icon for heading block', () => {
      const icon = getBlockIcon('heading');
      expect(icon).toBeDefined();
      expect(['function', 'object']).toContain(typeof icon);
    });

    it('returns correct icon for text block', () => {
      const icon = getBlockIcon('text');
      expect(icon).toBeDefined();
      expect(['function', 'object']).toContain(typeof icon);
    });

    it('returns fallback icon for unknown block type', () => {
      const icon = getBlockIcon('unknown' as BlockType);
      expect(icon).toBeDefined();
      expect(['function', 'object']).toContain(typeof icon);
    });
  });

  describe('BLOCK_TYPES', () => {
    it('contains all basic block types', () => {
      const basicTypes = BLOCK_TYPES.filter(bt => bt.category === 'Basic');
      expect(basicTypes.length).toBeGreaterThan(0);

      const basicTypeNames = basicTypes.map(bt => bt.type);
      expect(basicTypeNames).toContain('heading');
      expect(basicTypeNames).toContain('text');
      expect(basicTypeNames).toContain('image');
    });

    it('contains all media block types', () => {
      const mediaTypes = BLOCK_TYPES.filter(bt => bt.category === 'Media');
      expect(mediaTypes.length).toBeGreaterThan(0);

      const mediaTypeNames = mediaTypes.map(bt => bt.type);
      expect(mediaTypeNames).toContain('quote');
      expect(mediaTypeNames).toContain('code');
      expect(mediaTypeNames).toContain('video');
    });

    it('contains all layout block types', () => {
      const layoutTypes = BLOCK_TYPES.filter(bt => bt.category === 'Layout');
      expect(layoutTypes.length).toBeGreaterThan(0);

      const layoutTypeNames = layoutTypes.map(bt => bt.type);
      expect(layoutTypeNames).toContain('columns');
      expect(layoutTypeNames).toContain('tabs');
      expect(layoutTypeNames).toContain('accordion');
    });

    it('contains all component block types', () => {
      const componentTypes = BLOCK_TYPES.filter(bt => bt.category === 'Components');
      expect(componentTypes.length).toBeGreaterThan(0);

      const componentTypeNames = componentTypes.map(bt => bt.type);
      expect(componentTypeNames).toContain('hero');
      expect(componentTypeNames).toContain('cta');
      expect(componentTypeNames).toContain('testimonial');
    });

    it('each block type has required metadata', () => {
      BLOCK_TYPES.forEach(blockType => {
        expect(blockType.type).toBeDefined();
        expect(blockType.label).toBeDefined();
        expect(blockType.icon).toBeDefined();
        expect(blockType.category).toBeDefined();
        expect(['function', 'object']).toContain(typeof blockType.icon);
        expect(typeof blockType.category).toBe('string');
        expect(blockType.category.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getBlockTypeMetadata', () => {
    it('returns metadata for existing block type', () => {
      const metadata = getBlockTypeMetadata('heading');
      expect(metadata).toBeDefined();
      expect(metadata?.type).toBe('heading');
      expect(metadata?.label).toBe('Heading');
      expect(metadata?.category).toBe('Basic');
    });

    it('returns metadata for component block type', () => {
      const metadata = getBlockTypeMetadata('hero');
      expect(metadata).toBeDefined();
      expect(metadata?.type).toBe('hero');
      expect(metadata?.label).toBe('Hero Section');
      expect(metadata?.category).toBe('Components');
    });

    it('returns undefined for unknown block type', () => {
      const metadata = getBlockTypeMetadata('unknown' as BlockType);
      expect(metadata).toBeUndefined();
    });
  });

  describe('Icon consistency', () => {
    it('all icons in BLOCK_TYPES are valid React components', () => {
      BLOCK_TYPES.forEach(blockType => {
        expect(blockType.icon).toBeDefined();
        // Icons should be objects (React components)
        expect(typeof blockType.icon).toBe('object');
      });
    });

    it('no duplicate block types in BLOCK_TYPES', () => {
      const types = BLOCK_TYPES.map(bt => bt.type);
      const uniqueTypes = new Set(types);
      expect(types.length).toBe(uniqueTypes.size);
    });

    it('all block types have unique labels', () => {
      const labels = BLOCK_TYPES.map(bt => bt.label);
      const uniqueLabels = new Set(labels);
      expect(labels.length).toBe(uniqueLabels.size);
    });
  });
});
