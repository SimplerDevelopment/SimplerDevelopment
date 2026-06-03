import { describe, it, expect } from 'vitest';
import {
  solutions,
  getSolutionBySlug,
  getAllSolutions,
  type SolutionData,
} from '@/lib/data/solutions';

describe('lib/data/solutions', () => {
  describe('solutions array', () => {
    it('exports a non-empty array', () => {
      expect(Array.isArray(solutions)).toBe(true);
      expect(solutions.length).toBeGreaterThan(0);
    });

    it('contains exactly 14 solutions', () => {
      expect(solutions.length).toBe(14);
    });

    it('has unique slugs', () => {
      const slugs = solutions.map((s) => s.slug);
      const unique = new Set(slugs);
      expect(unique.size).toBe(slugs.length);
    });

    it('includes the expected solution slugs', () => {
      const slugs = solutions.map((s) => s.slug).sort();
      expect(slugs).toEqual([
        'ai-chatbot',
        'ai-connect',
        'automations',
        'booking',
        'company-brain',
        'contracts',
        'crm',
        'ecommerce',
        'email-marketing',
        'hosting',
        'pitch-decks',
        'project-management',
        'surveys',
        'websites',
      ]);
    });

    it('every solution has all required string fields populated', () => {
      for (const sol of solutions) {
        expect(typeof sol.slug).toBe('string');
        expect(sol.slug.length).toBeGreaterThan(0);
        expect(typeof sol.badge).toBe('string');
        expect(sol.badge.length).toBeGreaterThan(0);
        expect(typeof sol.title).toBe('string');
        expect(sol.title.length).toBeGreaterThan(0);
        expect(typeof sol.description).toBe('string');
        expect(sol.description.length).toBeGreaterThan(0);
        expect(typeof sol.color).toBe('string');
        expect(sol.color).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(typeof sol.icon).toBe('string');
        expect(sol.icon.length).toBeGreaterThan(0);
      }
    });

    it('every solution has at least one feature and one benefit', () => {
      for (const sol of solutions) {
        expect(Array.isArray(sol.features)).toBe(true);
        expect(sol.features.length).toBeGreaterThan(0);
        for (const f of sol.features) {
          expect(typeof f).toBe('string');
          expect(f.length).toBeGreaterThan(0);
        }
        expect(Array.isArray(sol.benefits)).toBe(true);
        expect(sol.benefits.length).toBeGreaterThan(0);
        for (const b of sol.benefits) {
          expect(typeof b).toBe('string');
          expect(b.length).toBeGreaterThan(0);
        }
      }
    });

    it('every solution has a non-empty process array of well-formed steps', () => {
      for (const sol of solutions) {
        expect(Array.isArray(sol.process)).toBe(true);
        expect(sol.process.length).toBeGreaterThan(0);
        for (const step of sol.process) {
          expect(typeof step.title).toBe('string');
          expect(step.title.length).toBeGreaterThan(0);
          expect(typeof step.description).toBe('string');
          expect(step.description.length).toBeGreaterThan(0);
        }
      }
    });

    it('uses valid hex colors for every solution', () => {
      for (const sol of solutions) {
        expect(sol.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it('slugs are kebab-case lowercase ASCII', () => {
      for (const sol of solutions) {
        expect(sol.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }
    });

    it('first solution is the websites builder with expected shape', () => {
      const websites = solutions[0];
      expect(websites.slug).toBe('websites');
      expect(websites.title).toBe('Drag-and-Drop Website Builder');
      expect(websites.color).toBe('#3b82f6');
      expect(websites.icon).toBe('language');
      expect(websites.features.length).toBe(6);
      expect(websites.benefits.length).toBe(4);
      expect(websites.process.length).toBe(4);
    });
  });

  describe('getSolutionBySlug', () => {
    it('returns the matching solution for a known slug', () => {
      const result = getSolutionBySlug('crm');
      expect(result).toBeDefined();
      expect(result?.slug).toBe('crm');
      expect(result?.title).toBe('Customer Relationship Management');
    });

    it('returns the same object reference present in the solutions array', () => {
      const result = getSolutionBySlug('booking');
      const direct = solutions.find((s) => s.slug === 'booking');
      expect(result).toBe(direct);
    });

    it('returns undefined for an unknown slug', () => {
      expect(getSolutionBySlug('does-not-exist')).toBeUndefined();
    });

    it('returns undefined for an empty string', () => {
      expect(getSolutionBySlug('')).toBeUndefined();
    });

    it('is case-sensitive (uppercase slug yields undefined)', () => {
      expect(getSolutionBySlug('CRM')).toBeUndefined();
    });

    it('finds every solution slug', () => {
      for (const sol of solutions) {
        const found = getSolutionBySlug(sol.slug);
        expect(found).toBeDefined();
        expect(found?.slug).toBe(sol.slug);
      }
    });
  });

  describe('getAllSolutions', () => {
    it('returns an array', () => {
      const all = getAllSolutions();
      expect(Array.isArray(all)).toBe(true);
    });

    it('returns the same length as the solutions export', () => {
      expect(getAllSolutions().length).toBe(solutions.length);
    });

    it('returns a reference to the solutions array', () => {
      expect(getAllSolutions()).toBe(solutions);
    });

    it('every element conforms to SolutionData shape', () => {
      const all = getAllSolutions();
      for (const sol of all) {
        const keys: (keyof SolutionData)[] = [
          'slug',
          'badge',
          'title',
          'description',
          'color',
          'icon',
          'features',
          'benefits',
          'process',
        ];
        for (const key of keys) {
          expect(sol[key]).toBeDefined();
        }
      }
    });
  });
});
