import test from 'node:test';
import assert from 'node:assert/strict';
import {
  importFeedback,
  supportedRasterHeader,
} from '../src/utils/importFeedback.ts';
const skips = { limit: 0, format: 0, size: 0, pixels: 0, failed: 0 };
test('raster signatures reject active content disguised as screenshot files', () => {
  const svg = new TextEncoder().encode('<svg onload="alert(1)">');
  assert.equal(supportedRasterHeader(svg, 'image/png'), false);
  assert.equal(supportedRasterHeader(svg, 'image/svg+xml'), false);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(supportedRasterHeader(png, 'image/png'), true);
  assert.equal(supportedRasterHeader(png, 'image/jpeg'), false);
  assert.equal(supportedRasterHeader(png, ''), true);
});
test('supported JPEG, WebP, and GIF headers retain compatibility', () => {
  assert.ok(
    supportedRasterHeader(new Uint8Array([255, 216, 255]), 'image/jpeg')
  );
  assert.ok(
    supportedRasterHeader(new Uint8Array([255, 216, 255]), 'image/jpg')
  );
  assert.ok(
    supportedRasterHeader(
      new TextEncoder().encode('RIFFxxxxWEBP'),
      'image/webp'
    )
  );
  assert.ok(
    supportedRasterHeader(new TextEncoder().encode('GIF89a'), 'image/gif')
  );
  assert.equal(supportedRasterHeader(new Uint8Array(), ''), false);
});
test('failed imports explain how to continue, including when no image was accepted', () => {
  const message = importFeedback(0, {
    ...skips,
    format: 1,
    size: 1,
    pixels: 1,
    failed: 1,
  });
  assert.match(message, /没有添加成功/);
  assert.match(message, /另存为 PNG 或 JPEG/);
  assert.match(message, /降低画质后重试/);
  assert.match(message, /分批拼接后重试/);
  assert.match(message, /原始截图/);
  assert.doesNotMatch(message, /预算|异常堆栈/);
  assert.match(importFeedback(2, skips), /已添加 2 张截图/);
});
