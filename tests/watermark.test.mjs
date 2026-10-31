import test from 'node:test';
import assert from 'node:assert/strict';
import { watermarkPositions } from '../src/utils/watermark.ts';

test('disabled repeating returns a single centered position', () => {
  assert.deepEqual(watermarkPositions(400, 1000, false), [{ x: 200, y: 500 }]);
});
test('repeating watermarks stay within canvas and use capped amount', () => {
  for (const [w, h] of [[1200, 900], [3000, 60000], [150, 120]]) {
    const points = watermarkPositions(w, h, true);
    assert.ok(points.length > 0 && points.length <= 100);
    for (const p of points) {
      assert.ok(p.x > 0 && p.x < w);
      assert.ok(p.y > 0 && p.y < h);
    }
  }
});
test('empty canvas does not render text', () => {
  assert.deepEqual(watermarkPositions(0, 1000, true), []);
});
