import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreOriginalImages, clampCropValue } from '../src/utils/imageState.ts';

const original = id => ({
  id, name: id, src: 'data:image/png;base64,AAAA', width: 400, height: 1000,
  cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0
});

test('collapses nested splits and restores four crop edges', () => {
  const pieces = [
    { ...original('split-a'), originalId: 'first', cropTop: 100, cropBottom: 300 },
    { ...original('split-b'), originalId: 'first', cropTop: 400, cropBottom: 100 },
    { ...original('second'), cropLeft: 12, cropRight: 25 }
  ];
  const restored = restoreOriginalImages(pieces);
  assert.deepEqual(restored.map(item => item.id), ['first', 'second']);
  assert.deepEqual(restored.map(item => [item.cropTop, item.cropBottom, item.cropLeft, item.cropRight]), [
    [0, 0, 0, 0], [0, 0, 0, 0]
  ]);
  assert.equal(restored[0].originalId, undefined);
  assert.equal(restored[0].src, pieces[0].src);
});

test('empty list and unsplit image stay valid', () => {
  const input = [original('one')];
  const restored = restoreOriginalImages(input);
  assert.deepEqual(restoreOriginalImages([]), []);
  assert.deepEqual(restored, input.map(item => ({ ...item, originalId: undefined })));
  assert.notEqual(restored[0], input[0]);
});

test('editing a crop edge only subtracts the opposite edge', () => {
  const img = { ...original('sample'), cropTop: 400, cropBottom: 20, cropLeft: 10, cropRight: 50 };
  assert.equal(clampCropValue(img, 'cropTop', 600), 600);
  assert.equal(clampCropValue(img, 'cropBottom', 700), 590);
  assert.equal(clampCropValue(img, 'cropLeft', 380), 340);
  assert.equal(clampCropValue(img, 'cropRight', 390), 380);
  assert.equal(clampCropValue(img, 'cropTop', -20), 0);
  assert.equal(clampCropValue(img, 'cropLeft', Number.NaN), 0);
});
