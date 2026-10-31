import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeOverlapSamples } from '../src/utils/stitching.ts';
import { estimateScrollMotion } from '../src/utils/videoFrames.ts';

/**
 * Deterministic screenshot fixtures approximate text/image-rich UI surfaces.
 * All fixtures are generated locally: no screenshots or user data leave CI.
 */
function pixel(x, y) {
  const z = ((x * 43 + y * 67 + x * y * 11) ^ ((x + 3) * (y + 7))) & 255;
  return [z, (z + x * 17) & 255, (z + y * 23) & 255, 255];
}

function fixture(axis, overlap, { withBars = false, withNoise = false } = {}) {
  const span = 44, max = 300, fullSize = 420;
  const width = axis === 'vertical' ? span : max;
  const height = axis === 'vertical' ? max : span;
  const a = new Uint8ClampedArray(width * height * 4);
  const b = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const along = axis === 'vertical' ? y : x;
      const across = axis === 'vertical' ? x : y;
      let p = pixel(across, fullSize - max + along);
      let q = pixel(across, fullSize - overlap + along);
      if (withNoise) {
        const d = (x * 3 + y * 7) % 5 - 2;
        q = [q[0] + d, q[1] + d, q[2] + d, 255];
      }
      if (withBars) {
        if (along >= max - 10) p = [12, 28, 49, 255];
        if (along < 10) q = [240, 240, 240, 255];
      }
      a.set(p, (y * width + x) * 4);
      b.set(q, (y * width + x) * 4);
    }
  }
  return { a, b, span, max };
}

test('scrolling article with sticky bars still matches its true seam', () => {
  const { a, b, span, max } = fixture('vertical', 244, { withBars: true });
  const result = analyzeOverlapSamples(a, b, span, max, 'vertical');
  assert.ok(Math.abs(result.overlap - 244) <= 2, JSON.stringify(result));
  assert.notEqual(result.confidence, 'low');
});

test('horizontal stitching with fixed sidebars and light JPEG-like noise', () => {
  const { a, b, span, max } = fixture('horizontal', 212, { withBars: true, withNoise: true });
  const result = analyzeOverlapSamples(a, b, span, max, 'horizontal');
  assert.ok(Math.abs(result.overlap - 212) <= 2, JSON.stringify(result));
  assert.notEqual(result.confidence, 'low');
});

test('large continuous overlaps are mapped back to source-pixel units', () => {
  const { a, b, span, max } = fixture('vertical', 244, { withNoise: true });
  const result = analyzeOverlapSamples(a, b, span, max, 'vertical', 8);
  assert.ok(Math.abs(result.overlap - 1952) <= 16, JSON.stringify(result));
});

test('repeating wallpaper does not trigger destructive auto-cropping', () => {
  const span = 44, max = 300;
  const a = new Uint8ClampedArray(span * max * 4);
  const b = new Uint8ClampedArray(span * max * 4);
  for (let y = 0; y < max; y++) for (let x = 0; x < span; x++) {
    const v = ((y % 8) * 34 + x * 3) & 255;
    const rgba = [v, 255 - v, v, 255];
    a.set(rgba, (y * span + x) * 4);
    b.set(rgba, (y * span + x) * 4);
  }
  assert.equal(analyzeOverlapSamples(a, b, span, max, 'vertical').overlap, 0);
});

test('changing only status bar never looks like full-page scrolling', () => {
  const width = 64, height = 96, a = new Uint8ClampedArray(width * height * 4);
  const b = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const core = pixel(x, y);
    a.set(core, (y * width + x) * 4);
    b.set(y < 8 ? [255, 0, 0, 255] : core, (y * width + x) * 4);
  }
  const motion = estimateScrollMotion(a, b, width, height);
  assert.equal(motion.shift, 0);
});
