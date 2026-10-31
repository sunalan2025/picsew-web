import test from 'node:test';
import assert from 'node:assert/strict';
import { planVideoSamples, frameDifference } from '../src/utils/videoFrames.ts';

test('samples from beginning to near end with bounded count', () => {
  const times = planVideoSamples(24, 40);
  assert.ok(times.length > 20 && times.length <= 40);
  assert.ok(times[0] > 0 && times.at(-1) < 24);
  assert.ok(times.every((value, i) => i === 0 || value > times[i - 1]));
});

test('long videos use the entire timeline rather than only the opening seconds', () => {
  const times = planVideoSamples(180, 36);
  assert.equal(times.length, 36);
  assert.ok(times.at(-1) > 179);
});

test('invalid duration and zero capacity produce no samples', () => {
  assert.deepEqual(planVideoSamples(Infinity, 12), []);
  assert.deepEqual(planVideoSamples(-4, 12), []);
  assert.deepEqual(planVideoSamples(20, 0), []);
});

test('frame comparison ignores alpha and rejects unrelated buffers', () => {
  const a = Uint8ClampedArray.from([20, 30, 40, 255, 100, 100, 100, 255]);
  const b = Uint8ClampedArray.from([20, 30, 40, 0, 100, 100, 100, 0]);
  assert.equal(frameDifference(a, b), 0);
  b[0] = 50;
  assert.equal(frameDifference(a, b), 5);
  assert.equal(frameDifference(a, Uint8ClampedArray.from([1, 2])), 255);
});
