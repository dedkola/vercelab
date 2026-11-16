import { describe, expect, it } from 'vitest';

import { scaledFontSize } from '@/lib/typography';

describe('scaledFontSize', () => {
  it('keeps base sizes at the default root font size', () => {
    expect(scaledFontSize(11, 16)).toBe(11);
    expect(scaledFontSize(14, 16)).toBe(14);
  });

  it('grows sizes in step with a larger root font size', () => {
    expect(scaledFontSize(11, 17.5)).toBe(12);
    expect(scaledFontSize(14, 19)).toBe(17);
  });

  it('returns whole pixels so canvas rendering stays crisp', () => {
    expect(Number.isInteger(scaledFontSize(11, 16.75))).toBe(true);
  });
});
