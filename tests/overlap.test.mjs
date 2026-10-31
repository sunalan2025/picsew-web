import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeOverlapSamples, findBestOverlapFromSamples } from '../src/utils/stitching.ts';

function color(x, y) {
  const v = (x * 27 + y * 51 + x * y * 17) % 256;
  return [v, (v + y * 23) % 256, (v + x * 31) % 256, 255];
}
function strips(axis, overlap, span = 32, max = 110) {
  const width = axis === 'vertical' ? span : max;
  const height = axis === 'vertical' ? max : span;
  const a = new Uint8ClampedArray(width * height * 4);
  const b = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bX = axis === 'horizontal' ? x + max - overlap : x;
    const bY = axis === 'vertical' ? y + max - overlap : y;
    a.set(color(x, y), (y * width + x) * 4);
    b.set(color(bX, bY), (y * width + x) * 4);
  }
  return { a, b, span, max };
}
test('matches vertical screenshot seams', () => {
  const { a, b, span, max } = strips('vertical', 68);
  assert.equal(findBestOverlapFromSamples(a, b, span, max, 'vertical'), 68);
});
test('matches horizontal photo strip seams', () => {
  const { a, b, span, max } = strips('horizontal', 74);
  assert.equal(findBestOverlapFromSamples(a, b, span, max, 'horizontal'), 74);
});
test('handles 1600+ pixel overlaps after downsampling without the 600px ceiling', () => {
  const { a, b, span, max } = strips('vertical', 242, 32, 300);
  const result = analyzeOverlapSamples(a, b, span, max, 'vertical', 8);
  assert.equal(result.overlap, 1936);
  assert.equal(result.uncertain, false);
});
test('rejects unrelated screenshots rather than deleting image content', () => {
  const { a, b, span, max } = strips('vertical', 68);
  b.fill(0);
  assert.equal(findBestOverlapFromSamples(a, b, span, max, 'vertical'), 0);
});
test('rejects blank and repetitive background without a unique alignment', () => {
  const width = 32, height = 110;
  const a = new Uint8ClampedArray(width * height * 4);
  const b = new Uint8ClampedArray(width * height * 4);
  a.fill(240); b.fill(240);
  assert.equal(analyzeOverlapSamples(a, b, width, height, 'vertical').overlap, 0);
});
test('does not guess on edge strips too small to align', () => {
  const { a, b, span } = strips('horizontal', 64);
  assert.equal(findBestOverlapFromSamples(a, b, span, 30, 'horizontal'), 0);
});
