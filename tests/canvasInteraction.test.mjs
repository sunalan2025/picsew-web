import test from 'node:test';
import assert from 'node:assert/strict';
import { canInteractWithCanvas } from '../src/utils/canvasInteraction.ts';

test('the default preview does not intercept a vertical page swipe', () => {
  assert.equal(canInteractWithCanvas('view'), false);
  assert.equal(canInteractWithCanvas('export'), false);
  assert.equal(canInteractWithCanvas('watermark'), false);
});
test('editing gestures are only enabled for explicit tools', () => {
  for (const tool of ['stitch', 'cut', 'markup']) {
    assert.equal(canInteractWithCanvas(tool), true);
  }
});
