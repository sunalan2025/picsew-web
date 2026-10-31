import test from 'node:test';
import assert from 'node:assert/strict';
import { findBestOverlapFromSamples } from '../src/utils/stitching.ts';

function color(x, y) {
  const v = (x * 27 + y * 51 + x * y * 17) % 256;
  return [v, (v + y * 23) % 256, (v + x * 31) % 256, 255];
}

function strips(axis, overlap) {
  const span = 24;
  const max = 100;
  const width = axis === 'vertical' ? span : max;
  const height = axis === 'vertical' ? max : span;
  const a = new Uint8ClampedArray(width * height * 4);
  const b = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bX = axis === 'horizontal' ? x + max - overlap : x;
      const bY = axis === 'vertical' ? y + max - overlap : y;
      a.set(color(x, y), (y * width + x) * 4);
      b.set(color(bX, bY), (y * width + x) * 4);
    }
  }
  return { a, b, span, max };
}

test('vertical overlap is found from matching lower and upper rows', () => {
  const { a, b, span, max } = strips('vertical', 64);
  assert.equal(findBestOverlapFromSamples(a, b, span, max, 'vertical'), 64);
});

test('horizontal overlap is found from matching right and left columns', () => {
  const { a, b, span, max } = strips('horizontal', 72);
  assert.equal(findBestOverlapFromSamples(a, b, span, max, 'horizontal'), 72);
});

test('rejects unrelated images rather than guessing a seam', () => {
  const { a, b, span, max } = strips('vertical', 64);
  b.fill(0);
  assert.equal(findBestOverlapFromSamples(a, b, span, max, 'vertical'), 0);
});

test('small strips are not treated as seamless overlaps', () => {
  const { a, b, span } = strips('horizontal', 64);
  assert.equal(findBestOverlapFromSamples(a, b, span, 30, 'horizontal'), 0);
});
