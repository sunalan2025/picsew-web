import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

// Serve real production assets under the same subpath as Pages, then install
// distinct workers without rebuilding files underneath another browser suite.
let version = 1;
const base = '/picsew-web/';
const origin = 'http://127.0.0.1:4178';
const dist = resolve('dist');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, origin).pathname;
    if (!pathname.startsWith(base)) throw new Error('outside app scope');
    const name = pathname.slice(base.length) || 'index.html';
    let body;
    if (name === 'assets/previous-build.js') {
      if (version !== 1) throw new Error('removed from new deployment');
      body = Buffer.from('export default "previous build asset";');
    } else {
      const file = resolve(dist, name);
      if (!file.startsWith(dist + '/')) throw new Error('outside dist');
      body = await readFile(file);
      if (name === 'sw.js') {
        let worker = body
          .toString()
          .replace(
            /const CACHE = ['"][^'"]+['"];/,
            `const CACHE = 'picsew-update-test-${version}';`
          );
        if (version === 1)
          worker = worker.replace(
            'const FILES = [',
            'const FILES = ["./assets/previous-build.js",'
          );
        body = Buffer.from(worker);
      }
    }
    response.writeHead(200, {
      'Content-Type': types[extname(name)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(4178, '127.0.0.1', resolve);
});
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.equal(
    await page.getByRole('complementary', { name: '应用更新' }).count(),
    0,
    'first installation does not request a reload'
  );
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 360;
    canvas.getContext('2d').fillRect(0, 0, 240, 360);
    return canvas.toDataURL().split(',')[1];
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'my-screenshot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data, 'base64'),
    });
  await page.locator('.workspace-canvas canvas').waitFor();
  const other = await context.newPage();
  await other.goto(origin + base);
  await other.waitForFunction(() => !!navigator.serviceWorker.controller);
  await other.evaluate(() => {
    window.editingMarker = 'keep this tab';
  });
  version = 2;
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  const notice = page.getByRole('complementary', { name: '应用更新' });
  await notice.waitFor();
  await page
    .getByRole('navigation', { name: '主要工具' })
    .getByRole('button', { name: '美化', exact: true })
    .click();
  await page.getByRole('combobox').first().selectOption('iphone16pro');
  await Promise.all([
    page.waitForNavigation(),
    notice.getByRole('button', { name: '更新并重新打开' }).click(),
  ]);
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await page.locator('.workspace-canvas canvas').waitFor();
  await page
    .getByRole('navigation', { name: '主要工具' })
    .getByRole('button', { name: '美化', exact: true })
    .click();
  assert.equal(
    await page.getByRole('combobox').first().inputValue(),
    'iphone16pro'
  );
  assert.equal(
    await other.evaluate(() => window.editingMarker),
    'keep this tab',
    'an update in another tab does not reload an editor'
  );
  await other.getByRole('complementary', { name: '应用更新' }).waitFor();
  console.log(
    'PASS: installed updates save the latest real project and preserve other open tabs'
  );

  await context.setOffline(true);
  const previous = await other.evaluate(async () => {
    const response = await fetch('./assets/previous-build.js');
    return { status: response.status, body: await response.text() };
  });
  assert.equal(previous.status, 200);
  assert.match(previous.body, /previous build asset/);
  await context.setOffline(false);
  console.log(
    'PASS: previous build assets remain available offline after activation'
  );

  version = 3;
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await notice.waitFor();
  await page.evaluate(() => {
    window.originalDatabaseOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = () => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    };
    window.savedMarker = 'do not reload';
  });
  await notice.getByRole('button', { name: '更新并重新打开' }).click();
  await notice.getByText(/更新前无法保存草稿/).waitFor();
  assert.equal(await page.evaluate(() => window.savedMarker), 'do not reload');
  assert.equal(
    await page.evaluate(
      async () =>
        (await navigator.serviceWorker.getRegistration()).waiting?.state
    ),
    'installed',
    'failed draft save must not activate the update'
  );
  await page.evaluate(() => {
    indexedDB.open = window.originalDatabaseOpen;
  });
  await Promise.all([
    page.waitForNavigation(),
    notice.getByRole('button', { name: '更新并重新打开' }).click(),
  ]);
  await page.getByRole('button', { name: '恢复草稿', exact: true }).waitFor();
  const keys = await page.evaluate(() => caches.keys());
  assert.deepEqual(keys.filter((key) => key.startsWith('picsew-')).sort(), [
    'picsew-update-test-2',
    'picsew-update-test-3',
  ]);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: storage failure keeps the editor open; retry succeeds with bounded version caches'
  );
  await context.close();
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
