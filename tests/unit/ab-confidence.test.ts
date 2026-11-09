import { describe, it, expect } from 'vitest';
import { confidencePill } from '@/lib/ab/confidence';

const stats = [{ key: 'A', views: 500 }, { key: 'B', views: 480 }];
describe('confidencePill (PUX-212)', () => {
  it('folds z/p/lift/significant and the sample floor into one plain label', () => {
    expect(confidencePill({ variantKey: 'B', controlKey: 'A', lift: 0.12, significant: true }, stats)).toEqual({ label: 'Winning · +12.0%', tone: 'ok' });
    expect(confidencePill({ variantKey: 'B', controlKey: 'A', lift: -0.05, significant: true }, stats).tone).toBe('warn');
    expect(confidencePill({ variantKey: 'B', controlKey: 'A', lift: 0.02, significant: false }, stats).label).toBe('No clear difference');
    expect(confidencePill({ variantKey: 'B', controlKey: 'A', lift: 0.4, significant: true }, [{ key: 'A', views: 30 }, { key: 'B', views: 25 }]).label).toBe('Too early to call');
  });
});
