import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, pushProject } from '../src/utils/project.ts';
import { getStitchedLayout } from '../src/utils/imageState.ts';
import { anchorAnnotation, mapAnnotation } from '../src/utils/annotations.ts';
import { mockupOutputSize } from '../src/utils/mockup.ts';
import { commonEdgeBands } from '../src/utils/fixedBars.ts';

const image = (id, extra = {}) => ({
  id,
  name: id,
  src: 'blob:test',
  width: 400,
  height: 600,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  ...extra,
});
test('history restores axis and settings with the matching geometry; new edit drops redo', () => {
  const initial = emptyProject();
  initial.images = [image('a'), image('b')];
  initial.overlaps = [80];
  let history = { entries: [structuredClone(initial)], index: 0 };
  const next = {
    ...initial,
    direction: 'horizontal',
    overlaps: [25],
    gap: 12,
    mockup: { ...initial.mockup, device: 'iphone16pro' },
  };
  history = pushProject(history, next);
  next.overlaps[0] = 999;
  assert.equal(history.entries[1].overlaps[0], 25);
  assert.equal(history.entries[0].direction, 'vertical');
  assert.equal(history.entries[0].overlaps[0], 80);
  assert.equal(history.entries[1].gap, 12);
  assert.equal(history.entries[1].mockup.device, 'iphone16pro');
  history = pushProject({ ...history, index: 0 }, { ...initial, gap: 4 });
  assert.equal(history.entries.length, 2);
  assert.equal(history.entries[1].direction, 'vertical');
});
test('a redaction is anchored in original pixels and follows crop, reorder, and source normalization', () => {
  const a = image('a'),
    b = image('b', { width: 200, height: 300 });
  const before = getStitchedLayout([a, b], [0], 0, 'vertical');
  const [mark] = anchorAnnotation(
    {
      id: 'm',
      type: 'blur',
      color: '#000000',
      strokeWidth: 0,
      x: 40,
      y: 680,
      width: 80,
      height: 60,
      blurType: 'pixel',
    },
    before.placements
  );
  assert.equal(mark.imageId, 'b');
  assert.equal(mark.x, 20);
  assert.equal(mark.y, 40);
  assert.equal(mark.width, 40);
  const cropped = { ...b, cropTop: 20 };
  const after = getStitchedLayout([cropped, a], [0], 0, 'vertical');
  const p = after.placements[0];
  const drawn = mapAnnotation(
    mark,
    p.scale,
    p.x - p.crop.left * p.scale,
    p.y - p.crop.top * p.scale
  );
  assert.equal(drawn.y, 20);
  assert.equal(drawn.x, 20);
  assert.equal(drawn.height, 30);
});
test('a mark crossing a seam is retained on both source images', () => {
  const layout = getStitchedLayout(
    [image('a'), image('b')],
    [0],
    0,
    'vertical'
  );
  const marks = anchorAnnotation(
    {
      id: 'm',
      type: 'rect',
      color: '#ff0000',
      strokeWidth: 3,
      x: 50,
      y: 580,
      width: 100,
      height: 80,
    },
    layout.placements
  );
  assert.deepEqual(
    marks.map((m) => m.imageId),
    ['a', 'b']
  );
  assert.equal(marks[1].y, -20);
});
test('layout uses visible height for horizontal normalization and includes gaps', () => {
  const layout = getStitchedLayout(
    [
      image('a', { cropTop: 100, cropBottom: 100 }),
      image('b', { width: 300, height: 200 }),
    ],
    [20],
    12,
    'horizontal'
  );
  assert.equal(layout.height, 400);
  assert.equal(layout.placements[1].scale, 2);
  assert.equal(layout.placements[1].x, 372);
  assert.equal(layout.width, 972);
});
test('stable edge suggestions exclude moving body and reject incomplete samples', () => {
  const w = 12,
    h = 100;
  const frames = [0, 1, 2].map((index) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const value = y < 10 || y >= 94 ? 90 : index * 90;
        data.set([value, value, value, 255], p);
      }
    return data;
  });
  assert.deepEqual(commonEdgeBands(frames, w, h), { top: 0.1, bottom: 0.06 });
  assert.deepEqual(commonEdgeBands([frames[0]], w, h), { top: 0, bottom: 0 });
});

test('standard and rotated frames are budgeted at their actual output dimensions', () => {
  const config = {
    ...emptyProject().mockup,
    device: 'iphone16pro',
    extendBottom: false,
  };
  const portrait = mockupOutputSize(12000, 1000, config);
  assert.ok(portrait.width * portrait.height > 32_000_000);
  const rotated = mockupOutputSize(12000, 1000, { ...config, rotation: 90 });
  assert.equal(rotated.width, 1116);
  assert.ok(rotated.height < 2400);
});
