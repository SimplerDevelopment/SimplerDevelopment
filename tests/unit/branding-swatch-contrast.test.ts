import { describe, it, expect } from 'vitest';
import { swatchPills } from '@/lib/branding/swatch-contrast';

describe('swatchPills (PUX-189)', () => {
  it('grades each swatch by its worst default pair; unpaired swatches get no pill', () => {
    const pills = swatchPills({ primaryColor: '#0f766e', secondaryColor: '#123456', accentColor: '#abcdef', backgroundColor: '#ffffff', textColor: '#111111', navBackground: '#0b1f3a', navTextColor: '#f5f5f5' });
    expect(pills.textColor?.tone).toBe('ok');
    expect(pills.textColor?.grade).toBe('AAA');
    expect(pills.backgroundColor?.ratio).toBeLessThanOrEqual(pills.textColor!.ratio); // worst pair on the shared background
    expect(pills.secondaryColor).toBeUndefined();
    const weak = swatchPills({ primaryColor: '#0f766e', backgroundColor: '#ffffff', textColor: '#bbbbbb', navBackground: '#0b1f3a', navTextColor: '#f5f5f5' });
    expect(weak.textColor?.tone).toBe('fail');
  });
});
