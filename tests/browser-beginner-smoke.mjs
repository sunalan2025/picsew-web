import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server = spawn(
  'npm',
  [
    'run',
    'preview',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    '4177',
    '--strictPort',
  ],
  { stdio: 'ignore', detached: true }
);
server.unref();
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://127.0.0.1:4177/')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(ready, 'preview is ready');
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
      hasTouch: mobile,
      isMobile: mobile,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:4177/');
    const steps = page.getByRole('navigation', { name: '三步完成长图' });
    assert.equal(await steps.getByRole('button').count(), 3);
    assert.ok(
      await steps.getByRole('button', { name: '检查拼接' }).isDisabled()
    );
    assert.ok(
      await page
        .locator('header')
        .getByRole('button', { name: '保存图片', exact: true })
        .isDisabled()
    );
    await page.getByRole('button', { name: '使用帮助', exact: true }).click();
    await page.getByRole('complementary', { name: '新手使用说明' }).waitFor();
    await page.getByRole('button', { name: '使用帮助', exact: true }).click();
    await page.screenshot({path:`/tmp/picsew-start-${mobile?'mobile':'desktop'}.png`});
    await page
      .getByRole('button', { name: '先用示例试试看', exact: true })
      .click();
    const canvas = page.locator('.workspace-canvas canvas');
    await canvas.waitFor({ timeout: 30000 });
    await page.getByRole('complementary', { name: '示例模式' }).waitFor();
    assert.equal(
      await steps
        .getByRole('button', { name: '检查拼接' })
        .getAttribute('aria-current'),
      'step'
    );
    const dimensions = await canvas.evaluate((c) => [c.width, c.height]);
    assert.deepEqual(
      dimensions,
      [420, 1320],
      'the example demonstrates complete automatic stitching'
    );
    await page.waitForTimeout(900);
    assert.equal(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const r = indexedDB.open('picsew-local', 1);
            r.onsuccess = () => {
              const db = r.result,
                tx = db.transaction('projects', 'readonly'),
                q = tx.objectStore('projects').get('current');
              tx.oncomplete = () => {
                resolve(!!q.result);
                db.close();
              };
            };
          })
      ),
      false,
      'trying an example does not create a personal draft'
    );
    await page
      .getByRole('button', { name: '换成我的截图', exact: true })
      .click();
    await page.getByRole('heading', { name: '多张截图，一张长图' }).waitFor();
    assert.equal(await canvas.count(), 0, 'example images are replaced');
    const input = page
      .locator('input[accept="image/png,image/jpeg,image/webp,image/gif"]')
      .first();
    await input.setInputFiles({
      name: 'fake.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
    });
    await page
      .getByText(/没有添加成功.*另存为 PNG 或 JPEG/)
      .first()
      .waitFor();
    assert.equal(
      await canvas.count(),
      0,
      'misleading MIME cannot bypass raster validation'
    );
    const data = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 500;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#dcfce7';
      ctx.fillRect(0, 0, 320, 500);
      ctx.fillStyle = '#14532d';
      ctx.font = '24px sans-serif';
      ctx.fillText('My screenshot', 20, 60);
      return c.toDataURL().split(',')[1];
    });
    await input.setInputFiles({
      name: 'my-screenshot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data, 'base64'),
    });
    await canvas.waitFor();
    assert.equal(
      await page.getByText(/没有添加成功/).count(),
      0,
      'a successful retry clears the previous failure'
    );
    await steps.getByRole('button', { name: '添加截图' }).click();
    const second = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 500;
      const x = c.getContext('2d');
      x.fillStyle = '#dbeafe';
      x.fillRect(0, 0, 320, 500);
      return c.toDataURL().split(',')[1];
    });
    await page
      .locator('input[accept="image/png,image/jpeg,image/webp,image/gif"]')
      .first()
      .setInputFiles({
        name: 'second.png',
        mimeType: 'image/png',
        buffer: Buffer.from(second, 'base64'),
      });
    await page.getByRole('complementary', { name: '拼接检查提示' }).waitFor();
    await steps.getByRole('button', { name: '检查拼接' }).click();
    await page
      .getByRole('button', { name: '这处看起来没问题', exact: true })
      .click();
    await page
      .getByText('连接检查完成，现在可以保存图片。', { exact: true })
      .waitFor();
    await steps.getByRole('button', { name: '保存图片' }).click();
    const advanced = page.locator('[data-save-options]');
    assert.equal(await advanced.getAttribute('open'), null);
    assert.equal(
      await page.getByRole('spinbutton', { name: '导出宽度' }).count(),
      0,
      'technical controls are hidden initially'
    );
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载图片', exact: true }).click();
    const file = await download;
    assert.match(file.suggestedFilename(), /\.png$/);
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const png = Buffer.concat(chunks);
    assert.equal(png.readUInt32BE(16), 320);
    assert.equal(png.readUInt32BE(20), 1000);
    await page.screenshot({
      path: `/tmp/picsew-beginner-${mobile ? 'mobile' : 'desktop'}.png`,
    });
    await page
      .getByText('更多保存选项（画质、PDF、分段）', { exact: true })
      .click();
    await page.getByRole('spinbutton', { name: '导出宽度' }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS: ${mobile ? 'mobile' : 'desktop'} three-step onboarding, demo replacement, safe import retry, default PNG, optional advanced settings`
    );
  }
} finally {
  await browser?.close();
  try {
    if (server.pid) process.kill(-server.pid, 'SIGTERM');
  } catch {}
}
