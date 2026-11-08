import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

// Issue #102: seam values are next-image source pixels, not output pixels.
// Exercise real gestures, normalization after cropping, and downloaded pixels.
const server = spawn(
  'npm',
  [
    'run',
    'preview',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    '4174',
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
      if ((await fetch('http://127.0.0.1:4174/')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* waiting for Vite */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Vite preview server was not ready');
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1340, height: 900 },
      hasTouch: mobile,
      isMobile: mobile,
    });
    for (const direction of ['horizontal', 'vertical']) {
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4174/');
      const vertical = direction === 'vertical';
      const files = await page.evaluate((vertical) => {
        return [
          [400, 400, '#ef4444'],
          vertical ? [200, 300, '#2563eb'] : [300, 200, '#2563eb'],
        ].map(([width, height, color]) => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, width, height);
          // A square reference mark makes aspect distortion observable.
          ctx.fillStyle = '#fff';
          ctx.fillRect(80, 80, 40, 40);
          return canvas.toDataURL().split(',')[1];
        });
      }, vertical);
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles(
          files.map((data, i) => ({
            name: `${i + 1}.png`,
            mimeType: 'image/png',
            buffer: Buffer.from(data, 'base64'),
          }))
        );
      const canvas = page.locator('.workspace-canvas canvas');
      await canvas.waitFor();
      const dock = page.getByRole('navigation', { name: '主要工具' });
      const dimensions = () => canvas.evaluate((c) => [c.width, c.height]);
      const waitDimensions = async (along) => {
        await page.waitForFunction(
          ({ vertical, along }) => {
            const c = document.querySelector('.workspace-canvas canvas');
            return (
              c &&
              (vertical
                ? c.height === along && c.width === 400
                : c.width === along && c.height === 400)
            );
          },
          { vertical, along }
        );
      };
      await dock.getByRole('button', { name: '拼接', exact: true }).click();
      if (!vertical)
        await page
          .getByRole('button', { name: '水平拼接', exact: true })
          .click();
      await waitDimensions(1000);

      // Cropping the cross axis changes the second image's scale from 2 to 2.5.
      await dock.getByRole('button', { name: '裁剪', exact: true }).click();
      await page.getByRole('button', { name: '下一张截图' }).click();
      await page.getByText('精确裁剪', { exact: true }).click();
      const crop = page.getByRole('spinbutton', {
        name: vertical ? '右侧裁剪像素' : '下侧裁剪像素',
      });
      await crop.fill('40');
      await crop.press('Tab');
      await dock.getByRole('button', { name: '拼接', exact: true }).click();
      await waitDimensions(1150);
      await page
        .getByRole('button', { name: vertical ? '全览' : '适宽', exact: true })
        .click();
      // Let explicit source-selection scrolling and auto-fit timers settle.
      await page.waitForTimeout(600);

      const client = mobile ? await context.newCDPSession(page) : null;
      for (const startAlong of [300, 700]) {
        const rect = await canvas.boundingBox();
        const [width, height] = await dimensions();
        const zoom = vertical ? rect.height / height : rect.width / width;
        const x = rect.x + ((vertical ? 200 : startAlong) * rect.width) / width;
        const y =
          rect.y + ((vertical ? startAlong : 200) * rect.height) / height;
        const end = {
          x: x - (vertical ? 0 : 150 * zoom),
          y: y - (vertical ? 150 * zoom : 0),
        };
        const before = Number(await page.locator('#overlap-0').inputValue());
        if (client) {
          await client.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x, y }],
          });
          for (let step = 1; step <= 5; step++) {
            await client.send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: [
                {
                  x: x + ((end.x - x) * step) / 5,
                  y: y + ((end.y - y) * step) / 5,
                },
              ],
            });
          }
          await client.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          });
        } else {
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(end.x, end.y, { steps: 5 });
          await page.mouse.up();
        }
        assert.equal(
          Number(await page.locator('#overlap-0').inputValue()),
          before + 60,
          `${direction}/${mobile ? 'touch' : 'mouse'}: 150 output pixels must adjust 60 source pixels at 2.5x scale`
        );
        await waitDimensions(1150 - (before + 60) * 2.5);
      }
      await client?.detach();

      // Undo and redo must preserve the accepted seam value.
      await page.keyboard.press('Control+z');
      await waitDimensions(1000);
      await page.keyboard.press('Control+Shift+z');
      await waitDimensions(850);

      // The marker in the resized second source stays square (40 * 2.5 px).
      assert.deepEqual(
        await canvas.evaluate((c, vertical) => {
          const ctx = c.getContext('2d');
          const sample = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
          return vertical
            ? [sample(250, 350), sample(310, 350), sample(250, 410)]
            : [sample(350, 250), sample(410, 250), sample(350, 310)];
        }, vertical),
        [
          [255, 255, 255, 255],
          [37, 99, 235, 255],
          [37, 99, 235, 255],
        ],
        'cross-axis cropping and normalization must preserve source aspect ratio'
      );

      await dock.getByRole('button', { name: '导出', exact: true }).click();
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: /下载图片/ }).click();
      const stream = await (await downloaded).createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const png = Buffer.concat(chunks).toString('base64');
      assert.ok(
        await canvas.evaluate(async (c, data) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          if (image.width !== c.width || image.height !== c.height)
            return false;
          const copy = document.createElement('canvas');
          copy.width = c.width;
          copy.height = c.height;
          copy.getContext('2d').drawImage(image, 0, 0);
          const actual = copy
            .getContext('2d')
            .getImageData(0, 0, c.width, c.height).data;
          const expected = c
            .getContext('2d')
            .getImageData(0, 0, c.width, c.height).data;
          return actual.every((byte, i) => byte === expected[i]);
        }, png),
        'downloaded PNG must match every preview pixel'
      );
      console.log(
        `PASS: ${direction}, ${mobile ? 'touch/mobile' : 'mouse/desktop'}, cropped scale, drag, undo/redo, PNG parity`
      );
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser?.close();
  try {
    if (server.pid) process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already stopped */
  }
}
