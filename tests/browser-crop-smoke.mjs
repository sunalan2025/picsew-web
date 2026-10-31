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
    { name: '04_scroll.png', mimeType: 'image/png', buffer: generateScreenshot(840) },
    { name: '02_scroll.png', mimeType: 'image/png', buffer: generateScreenshot(280) },
    { name: '01_scroll.png', mimeType: 'image/png', buffer: generateScreenshot(0) },
    { name: '03_scroll.png', mimeType: 'image/png', buffer: generateScreenshot(560) }
  ]);
  await page.getByRole('button', { name: '裁剪', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const layoutCheck = async (panelLabel) => {
    const canvasBox = await page.getByRole('region',{name:'始终可见的拼接画布'}).boundingBox();
    const panelBox = await page.locator('.workspace-sheet').boundingBox();
    assert.ok(canvasBox && panelBox && canvasBox.width > 230 && panelBox.width > 250,
      panelLabel + ': canvas and inspector must both remain visible');
    const mobile = (await page.viewportSize()).width <= 900;
    if (mobile) assert.ok(canvasBox.y + canvasBox.height <= panelBox.y + 3,
      panelLabel + ': panels must stack without overlap on mobile');
    else assert.ok(canvasBox.x + canvasBox.width <= panelBox.x + 3,
      panelLabel + ': inspector must not obscure artwork on desktop');
  };
  await page.getByRole('button', { name: '裁剪', exact: true }).click();
  await layoutCheck('crop');
  const canvas = page.locator('.workspace-canvas canvas').first();
  const widthBefore = await canvas.evaluate(el => el.width);
  const handle = await page.getByRole('button', { name: '拖动裁剪左侧' }).boundingBox();
  assert.ok(handle, 'crop border handle missing');
  await page.mouse.move(handle.x + handle.width/2,handle.y + handle.height/2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width/2 + 30,handle.y + handle.height/2,{steps:6});
  await page.mouse.up();
  await page.getByText('精确裁剪',{exact:true}).click();
  const cropInput = page.getByRole('spinbutton',{name:'左侧裁剪像素'});
  assert.ok(Number(await cropInput.inputValue())>0,'drag should crop original pixels');
  await page.waitForFunction(before=>document.querySelector('.workspace-canvas canvas')?.width<before,widthBefore);
  await page.getByRole('button',{name:'下一张截图'}).click();
  await page.getByText('第 2/4 张').waitFor();
  await page.getByRole('button',{name:'高级：分割当前截图'}).click();
  await page.getByRole('button',{name:'返回四边裁剪'}).click();
  await page.getByText('选择保留的画面').waitFor();

  // Every navigation group shares the exact same canvas/inspector geometry.
  for(const tab of ['拼接','素材','美化','导出','裁剪']){
    await page.getByRole('navigation',{name:'主要工具'}).getByRole('button',{name:tab,exact:true}).click();
    await layoutCheck(tab);
    assert.equal(await page.locator('.workspace-canvas canvas').count(),1,
      tab+': the single export canvas must remain mounted');
  }
  await page.getByRole('button',{name:'拼接',exact:true}).click();
  await page.getByRole('button',{name:'在画布定位接缝 3'}).click();
  await page.locator('[data-seam-highlight="2"]').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.workspace-canvas .overflow-auto')?.scrollTop>50);
  await page.locator('.workspace-canvas .overflow-auto').evaluate(el=>el.scrollTop=0);
  await page.getByRole('button',{name:'在画布定位接缝 3'}).click();
  await page.waitForFunction(()=>document.querySelector('.workspace-canvas .overflow-auto')?.scrollTop>50);

  await page.setViewportSize({width:390,height:844});
  // Start with a *different* tool: selecting the already active tool is an
  // intentional shortcut to close the inspector.
  for(const tab of ['素材','拼接','美化','导出','裁剪']){
    await page.getByRole('navigation',{name:'主要工具'}).getByRole('button',{name:tab,exact:true}).click();
    await layoutCheck('mobile '+tab);
  }
  await page.locator('.crop-original-stage').scrollIntoViewIfNeeded();
  const stage=await page.locator('.crop-original-stage').boundingBox();
  assert.ok(stage && stage.height>=200,'mobile crop preview must stay usable');
  const cropBounds=await page.getByRole('button',{name:'拖动裁剪底部'}).boundingBox();
  assert.ok(cropBounds,'mobile crop handles must exist');
  console.log('PASS: unified inspector across modules, exact crop, real seam jumps, desktop/mobile layout');
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
