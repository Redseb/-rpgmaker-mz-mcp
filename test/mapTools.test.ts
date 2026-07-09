import { describe, it, expect } from 'vitest';
import { tileIndex } from '../src/tools/mapTools.js';

describe('tileIndex', () => {
  const width = 20;
  const height = 15;

  it('returns 0 for the top-left tile of layer 0', () => {
    expect(tileIndex(width, height, 0, 0, 0)).toBe(0);
  });

  it('advances by 1 per column (x)', () => {
    expect(tileIndex(width, height, 5, 0, 0)).toBe(5);
  });

  it('advances by `width` per row (y)', () => {
    expect(tileIndex(width, height, 0, 1, 0)).toBe(width);
    expect(tileIndex(width, height, 3, 2, 0)).toBe(2 * width + 3);
  });

  it('advances by `width * height` per layer', () => {
    const layerSize = width * height;
    expect(tileIndex(width, height, 0, 0, 1)).toBe(layerSize);
    expect(tileIndex(width, height, 0, 0, 5)).toBe(5 * layerSize);
  });

  it('composes layer, row, and column offsets', () => {
    // region layer (5), tile (7, 4)
    expect(tileIndex(width, height, 7, 4, 5)).toBe((5 * height + 4) * width + 7);
  });
});
