import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** A deterministic screenshot of a virtual tall article, with a unique pattern per row. */
function generateScreenshot(offset, width = 220, height = 600) {
  const bytes = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const base = y * (width * 3 + 1);
    bytes[base] = 0; // PNG scanline filter None
    for (let x = 0; x < width; x++) {
      const position = base + 1 + x * 3;
      const v = ((x * 37 + (y + offset) * 53 + x * (y + offset) * 11) ^ (x * 17)) & 255;
      bytes[position] = v;
      bytes[position + 1] = v ^ 83;
      bytes[position + 2] = v ^ 191;
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8; head[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', head),
    pngChunk('IDAT', deflateSync(bytes)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
  { stdio: ['ignore', 'ignore', 'ignore'], detached: true });
server.unref();
let browser;
let page;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch('http://127.0.0.1:4173/'); if (res.ok) { ready = true; break; } }
    catch { /* waiting for local server */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Vite preview server was not ready');
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1340, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4173/');
  const input = page.locator('input[accept="image/png,image/jpeg,image/webp,image/gif"]').first();
  await input.setInputFiles([
    { name: '02_scroll.png', mimeType: 'image/png', buffer: generateScreenshot(280) },
    { name: '01_scroll.png', mimeType: 'image/png', buffer: generateScreenshot(0) }
  ]);
  await page.getByRole('button', { name: '裁剪', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: '裁剪', exact: true }).click();
  await page.getByRole('region', { name: '可视化裁剪工作区' }).waitFor({ state: 'visible' });
  const editBox = await page.locator('.crop-studio-editor-pane').boundingBox();
  const liveBox = await page.locator('.crop-studio-result-pane').boundingBox();
  assert.ok(editBox && liveBox && editBox.width > 200 && liveBox.width > 200, 'both panels visible');
  assert.ok(editBox.x + editBox.width <= liveBox.x + 2, 'desktop panels must not overlap');

  const canvas = page.locator('.crop-result-canvas canvas').first();
  await canvas.waitFor({ state: 'visible' });
  const originalWidth = await canvas.evaluate(el => el.width);
  const left = page.getByRole('button', { name: '拖动裁剪左侧' });
  const handle = await left.boundingBox();
  assert.ok(handle, 'crop drag handle is visible');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2, { steps: 5 });
  await page.mouse.up();
  const cropInput = page.getByRole('spinbutton', { name: '左侧裁剪像素' });
  // Open optional exact controls only when checking numeric values.
  await page.getByText('精确裁剪', { exact: true }).click();
  await cropInput.waitFor();
  const changed = Number(await cropInput.inputValue());
  assert.ok(changed > 0, 'drag must update exact crop source pixels');
  await page.waitForFunction(previous => {
    const current = document.querySelector('.crop-result-canvas canvas');
    return current && current.width < previous;
  }, originalWidth, { timeout: 20000 });

  await page.getByRole('button', { name: '下一张截图' }).click();
  await page.getByText('第 2/2 张').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowEditor = await page.locator('.crop-studio-editor-pane').boundingBox();
  const narrowResult = await page.locator('.crop-studio-result-pane').boundingBox();
  assert.ok(narrowEditor && narrowResult, 'mobile crop and result should both exist');
  assert.ok(narrowEditor.y + narrowEditor.height <= narrowResult.y + 2,
    'mobile panels must stack without covering each other');
  const cropStage = await page.locator('.crop-original-stage').boundingBox();
  assert.ok(cropStage && cropStage.height >= 200,
    'mobile source image must not collapse when the advanced numeric controls are expanded');
  await page.screenshot({ path: 'browser-crop-success.png', fullPage: false });
  console.log('PASS: crop workspace source handles, WYSIWYG live canvas, selection and mobile layout');
} catch (error) {
  if (page) await page.screenshot({ path: 'browser-crop-failure.png', fullPage: false }).catch(()=>{});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  // Stop the full npm → Vite process group, not just the npm wrapper.
  try { if (server.pid) process.kill(-server.pid, 'SIGTERM'); } catch { /* already stopped */ }
}
