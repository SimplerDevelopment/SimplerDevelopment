import { describe, it, expect } from 'vitest';
import {
  parseColor,
  contrastRatio,
  analyzeContrast,
  gradeNormalText,
  gradeLargeText,
  defaultContrastPairs,
} from '@/lib/branding/contrast';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
  });
  it('parses 3-digit hex', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });
  it('strips alpha from 8-digit hex', () => {
    expect(parseColor('#ff0000aa')).toEqual({ r: 255, g: 0, b: 0 });
  });
  it('parses rgb() and rgba()', () => {
    expect(parseColor('rgb(12, 34, 56)')).toEqual({ r: 12, g: 34, b: 56 });
    expect(parseColor('rgba(12, 34, 56, 0.5)')).toEqual({ r: 12, g: 34, b: 56 });
  });
  it('returns null for invalid input', () => {
    expect(parseColor(undefined)).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor('not-a-color')).toBeNull();
    expect(parseColor('#xyz')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
  it('returns 1 for same color', () => {
    expect(contrastRatio('#888888', '#888888')).toBe(1);
  });
  it('is symmetric (order does not matter)', () => {
    expect(contrastRatio('#333', '#eee')).toBeCloseTo(contrastRatio('#eee', '#333'));
  });
  it('returns NaN for unparseable input', () => {
    expect(contrastRatio('nope', '#fff')).toBeNaN();
  });
});

describe('analyzeContrast', () => {
  it('grades #000 on #fff as AAA', () => {
    const r = analyzeContrast('#000', '#fff');
    expect(r.ratio).toBeGreaterThan(7);
    expect(r.passesAA).toBe(true);
    expect(r.passesAAA).toBe(true);
    expect(r.normalText).toBe('AAA');
  });

  it('grades #888 on #fff as borderline AA-large (3.0–4.5)', () => {
    const r = analyzeContrast('#888', '#fff');
    expect(r.ratio).toBeGreaterThan(3);
    expect(r.ratio).toBeLessThan(4.5);
    expect(r.passesAA).toBe(false);
    expect(r.normalText).toBe('AA-large');
    expect(r.largeText).toBe('AA');
  });

  it('grades failing pair correctly', () => {
    const r = analyzeContrast('#ddd', '#fff');
    expect(r.ratio).toBeLessThan(3);
    expect(r.normalText).toBe('fail');
    expect(r.largeText).toBe('fail');
  });

  it('returns ratio 0 for unparseable colors', () => {
    const r = analyzeContrast(undefined, '#fff');
    expect(r.ratio).toBe(0);
    expect(r.normalText).toBe('fail');
  });
});

describe('grade helpers', () => {
  it('gradeNormalText thresholds', () => {
    expect(gradeNormalText(7.0)).toBe('AAA');
    expect(gradeNormalText(6.99)).toBe('AA');
    expect(gradeNormalText(4.5)).toBe('AA');
    expect(gradeNormalText(4.49)).toBe('AA-large');
    expect(gradeNormalText(3.0)).toBe('AA-large');
    expect(gradeNormalText(2.99)).toBe('fail');
  });
  it('gradeLargeText thresholds', () => {
    expect(gradeLargeText(4.5)).toBe('AAA');
    expect(gradeLargeText(3.0)).toBe('AA');
    expect(gradeLargeText(2.99)).toBe('fail');
  });
});

describe('defaultContrastPairs', () => {
  it('includes the standard five pairs', () => {
    const pairs = defaultContrastPairs({
      primaryColor: '#111',
      textColor: '#222',
      backgroundColor: '#fff',
      navBackground: '#333',
      navTextColor: '#eee',
      linkColor: '#0066cc',
      buttonStyle: { primaryBg: '#111', primaryText: '#fff' },
    });
    const ids = pairs.map((p) => p.id);
    expect(ids).toEqual([
      'text-on-bg',
      'primary-on-bg',
      'nav-text-on-nav-bg',
      'btn-text-on-btn-bg',
      'link-on-bg',
    ]);
  });

  it('tolerates missing button/nav/link config', () => {
    const pairs = defaultContrastPairs({
      primaryColor: '#111',
      textColor: '#222',
      backgroundColor: '#fff',
    });
    expect(pairs.length).toBe(5);
    expect(pairs.find((p) => p.id === 'btn-text-on-btn-bg')?.fg).toBeUndefined();
  });
});
