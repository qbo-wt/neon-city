import { describe, it, expect } from 'vitest';
import { autoQuality } from '../../src/three/quality';

describe('auto graphics quality', () => {
  it('stays high at 60 fps, even with a few hitches', () => {
    expect(autoQuality([...Array(170).fill(16.7), ...Array(10).fill(120)])).toBe('high');
  });

  it('drops to low when most frames are slower than 38 fps', () => {
    expect(autoQuality([...Array(100).fill(33.3), ...Array(80).fill(16.7)])).toBe('low');
  });

  it('just above 38 fps is still high, just below is low', () => {
    expect(autoQuality(Array(9).fill(25.5))).toBe('high');
    expect(autoQuality(Array(9).fill(27))).toBe('low');
  });

  it('no samples: high', () => {
    expect(autoQuality([])).toBe('high');
  });
});
