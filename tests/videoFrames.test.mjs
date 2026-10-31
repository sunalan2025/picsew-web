import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planVideoSamples, planVideoScanTimes, frameDifference,
  estimateScrollMotion, shouldKeepScrollFrame
} from '../src/utils/videoFrames.ts';

test('old deterministic time sampler remains backwards compatible', () => {
  const samples = planVideoSamples(24, 40);
  assert.ok(samples.length > 20 && samples.length <= 40);
  assert.ok(samples.at(-1) < 24);
  assert.equal(planVideoSamples(Infinity, 20).length, 0);
});

test('dense scan decouples examined video frames from accepted picture count', () => {
  const times = planVideoScanTimes(10);
  assert.ok(times.length >= 35 && times.length <= 45);
  assert.ok(times.every((t, i) => i === 0 || t > times[i - 1]));
  assert.ok(times.at(-1) < 10);
  assert.equal(planVideoScanTimes(180).length, 480);
  assert.deepEqual(planVideoScanTimes(0), []);
});

test('frame difference ignores alpha', () => {
  const a = Uint8ClampedArray.from([20, 30, 40, 255, 100, 100, 100, 255]);
  const b = Uint8ClampedArray.from([20, 30, 40, 0, 100, 100, 100, 0]);
  assert.equal(frameDifference(a, b), 0);
  b[0] = 50;
  assert.equal(frameDifference(a, b), 5);
});

const WIDTH = 64, HEIGHT = 96;
const color = (x, y) => {
  const v = (x * 23 + y * 47 + x * y * 9) % 256;
  return [v, (v + y * 13) % 256, (v + x * 17) % 256, 255];
};
function frame(base) {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    // Fixed navigation bars do not move with the scrolled content.
    const staticBar = y < 8 || y >= HEIGHT - 8;
    pixels.set(staticBar ? [18, 24, 32, 255] : color(x, y + base), (y * WIDTH + x) * 4);
  }
  return pixels;
}
test('estimates vertical scrolling despite fixed header and footer', () => {
  const motion = estimateScrollMotion(frame(10), frame(35), WIDTH, HEIGHT);
  assert.equal(motion.shift, 25);
  assert.notEqual(motion.confidence, 'low');
  assert.equal(shouldKeepScrollFrame(motion), true);
});

test('does not keep static frames and detects reverse scrolling', () => {
  const stationary = estimateScrollMotion(frame(10), frame(10), WIDTH, HEIGHT);
  assert.equal(stationary.shift, 0);
  assert.equal(shouldKeepScrollFrame(stationary), false);
  const reverse = estimateScrollMotion(frame(35), frame(10), WIDTH, HEIGHT);
  assert.ok(reverse.shift <= -20);
  assert.equal(shouldKeepScrollFrame(reverse), false);
});

test('small movements accumulate until sufficient scroll has occurred', () => {
  assert.equal(shouldKeepScrollFrame({ shift: 6, confidence: 'high', error: 1 }), false);
  assert.equal(shouldKeepScrollFrame({ shift: 6, confidence: 'high', error: 1 }, true), true);
  assert.equal(shouldKeepScrollFrame({ shift: 30, confidence: 'low', error: 60 }), false);
});

test('blank frames have no trustworthy movement vector', () => {
  const blank = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(250);
  assert.equal(estimateScrollMotion(blank, blank, WIDTH, HEIGHT).confidence, 'low');
});
