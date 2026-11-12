import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const servers = [
  spawn(
    'npm',
    [
      'run',
      'dev',
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      '4175',
      '--strictPort',
    ],
    { stdio: 'ignore', detached: true }
  ),
  spawn(
    'npm',
    [
      'run',
      'preview',
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      '4176',
      '--strictPort',
    ],
    { stdio: 'ignore', detached: true }
  ),
];
for (const server of servers) server.unref();
let browser;
async function download(page, button) {
  const event = page.waitForEvent('download');
  await button.click();
  const stream = await (await event).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function waitForDraftImages(page, expected) {
  let actual;
  for (let i = 0; i < 40; i++) {
    actual = await page.evaluate(async () => {
      const { loadDraft } = await import('/src/utils/drafts.ts');
      const draft = await loadDraft();
      if (draft)
        for (const image of draft.project.images)
          URL.revokeObjectURL(image.src);
      return draft?.project.images.length ?? 0;
    });
    if (actual === expected) return;
    await page.waitForTimeout(100);
  }
  assert.equal(
    actual,
    expected,
    'persisted draft must match the current images'
  );
}
try {
  for (const port of [4175, 4176]) {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.ok(ready, `server ${port} ready`);
  }
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1340, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4175/');
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const checks = await page.evaluate(async () => {
    const { detectOverlapDetailed, detectOverlapAsync } =
      await import('/src/utils/stitching.ts');
    const { emptyProject } = await import('/src/utils/project.ts');
    const { renderProject, previewScaleFor } =
      await import('/src/utils/renderProject.ts');
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 1000;
    const ctx = c.getContext('2d');
    const pixels = ctx.createImageData(400, 1000);
    let seed = 37;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data.set(
        [seed >>> 24, (seed >>> 16) & 255, (seed >>> 8) & 255, 255],
        i
      );
    }
    ctx.putImageData(pixels, 0, 0);
    const a = document.createElement('canvas');
    a.width = 400;
    a.height = 600;
    a.getContext('2d').drawImage(c, 0, 0, 400, 600, 0, 0, 400, 600);
    const b = document.createElement('canvas');
    b.width = 200;
    b.height = 300;
    b.getContext('2d').drawImage(c, 0, 300, 400, 600, 0, 0, 200, 300);
    const match = detectOverlapDetailed(a, b),
      worker = await detectOverlapAsync(a, b);
    const p = emptyProject();
    p.images = [
      {
        id: 'a',
        name: 'a',
        src: a.toDataURL(),
        width: 400,
        height: 600,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
      },
    ];
    p.annotations = [
      {
        id: 'mask',
        imageId: 'a',
        type: 'blur',
        color: '#000000',
        strokeWidth: 0,
        x: 50,
        y: 190,
        width: 80,
        height: 80,
        blurType: 'pixel',
      },
    ];
    p.watermark = {
      ...p.watermark,
      enabled: true,
      text: 'Local',
      repeat: true,
    };
    const full = await renderProject(p),
      tile = await renderProject(p, { y: 200, height: 200 });
    const expected = full.getContext('2d').getImageData(0, 200, 400, 200).data,
      actual = tile.getContext('2d').getImageData(0, 0, 400, 200).data;
    const files = [a.toDataURL().split(',')[1], b.toDataURL().split(',')[1]];
    return {
      match,
      worker,
      tileParity: expected.every((v, i) => actual[i] === v),
      previewScale: previewScaleFor(3000, 100000),
      files,
    };
  });
  assert.equal(
    checks.match.overlap,
    150,
    'matching must normalize both axes for mixed resolutions'
  );
  assert.deepEqual(
    checks.worker,
    checks.match,
    'worker and synchronous matcher agree'
  );
  assert.ok(
    checks.tileParity,
    'tiled render and watermark match the full composition'
  );
  assert.ok(
    3000 * 100000 * checks.previewScale ** 2 <= 8_000_001,
    'preview respects memory budget'
  );
  console.log(
    'PASS: normalized matching, worker parity, bounded preview, tiled watermark parity'
  );
  const video = await page.evaluate(async () => {
    const { extractVideoFrames } = await import('/src/utils/videoFrames.ts');
    const blob = await (await fetch('/tests/fixtures/recording.webm')).blob();
    const file = new File([blob], 'recording.webm', { type: 'video/webm' });
    const progress = [];
    const result = await extractVideoFrames(
      file,
      8,
      new AbortController().signal,
      (n, total) => progress.push([n, total]),
      { start: 0.4, end: 1.4 }
    );
    const frame = await extractVideoFrames(
      file,
      1,
      new AbortController().signal,
      () => {},
      { singleFrameTime: 1.2 }
    );
    const controller = new AbortController();
    controller.abort();
    let aborted = false;
    try {
      await extractVideoFrames(file, 2, controller.signal, () => {});
    } catch (e) {
      aborted = e.name === 'AbortError';
    }
    const times = result.images.map((image) => image.videoTime),
      single = frame.images.map((image) => image.videoTime);
    for (const image of [...result.images, ...frame.images])
      URL.revokeObjectURL(image.src);
    return { times, single, aborted, progress: progress.length };
  });
  assert.ok(
    video.times.length > 0 && video.times.every((t) => t >= 0.4 && t <= 1.4)
  );
  assert.deepEqual(video.single, [1.2]);
  assert.ok(video.aborted && video.progress > 0);
  console.log(
    'PASS: real WebM decoding, selected interval, exact supplemental frame, cancellation'
  );

  // Use solid images to keep automatic overlap uncertain and geometry deterministic.
  const files = await page.evaluate(() =>
    [
      [400, 600, '#ef4444'],
      [200, 300, '#2563eb'],
    ].map(([w, h, color]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      return c.toDataURL().split(',')[1];
    })
  );
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
  await dock.getByRole('button', { name: '素材', exact: true }).click();
  const originalOrder = await page
    .locator('[data-picsew-image-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.picsewImageId));
  await page.getByRole('button', { name: '一键倒序', exact: true }).click();
  await page.waitForFunction(
    (ids) =>
      JSON.stringify(
        Array.from(
          document.querySelectorAll('[data-picsew-image-id]'),
          (node) => node.dataset.picsewImageId
        )
      ) === JSON.stringify(ids),
    [...originalOrder].reverse()
  );
  await page.keyboard.press('Control+z');
  await page.waitForFunction(
    (ids) =>
      JSON.stringify(
        Array.from(
          document.querySelectorAll('[data-picsew-image-id]'),
          (node) => node.dataset.picsewImageId
        )
      ) === JSON.stringify(ids),
    originalOrder
  );
  console.log('PASS: reverse screenshot order as one undoable project change');
  await dock.getByRole('button', { name: '拼接', exact: true }).click();
  await page.locator('#overlap-0').focus();
  await page.locator('#overlap-0').press('ArrowRight');
  await page.locator('#overlap-0').press('Tab');
  await page.getByRole('button', { name: '水平拼接', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('.workspace-canvas canvas')?.height === 600
  );
  await page.locator('.workspace-processing').waitFor({ state: 'hidden' });
  await page.keyboard.press('Control+z');
  assert.equal(
    await page
      .getByRole('button', { name: '垂直拼接', exact: true })
      .getAttribute('aria-pressed'),
    'true'
  );
  assert.equal(await page.locator('#overlap-0').inputValue(), '1');
  await page.getByRole('button', { name: '在画布定位接缝 1' }).click();
  await page.getByRole('button', { name: '增加重合 1 像素' }).click();
  assert.equal(await page.locator('#overlap-0').inputValue(), '2');
  await page.getByRole('button', { name: '只重新匹配这处' }).click();
  await page.waitForFunction(
    () => document.querySelector('#overlap-0')?.value === '0'
  );
  console.log(
    'PASS: direction-aware history, seam microscope, single-seam rematch'
  );
  await dock.getByRole('button', { name: '美化', exact: true }).click();
  await page.getByRole('combobox').selectOption('iphone16pro');
  const decorated = await download(
    page,
    page
      .locator('header')
      .getByRole('button', { name: '保存图片', exact: true })
  );
  await dock.getByRole('button', { name: '裁剪', exact: true }).click();
  await page.getByRole('button', { name: '标注与打码', exact: true }).click();
  const fromMarkup = await download(
    page,
    page
      .locator('header')
      .getByRole('button', { name: '保存图片', exact: true })
  );
  assert.ok(
    decorated.equals(fromMarkup),
    'export must include the same mockup from every tool'
  );
  await page.getByRole('button', { name: '全览', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.workspace-canvas canvas').getBoundingClientRect()
        .y >= 0
  );
  await page.getByRole('button', { name: '矩形框', exact: true }).click();
  const r = await canvas.boundingBox();
  const dims = await canvas.evaluate((c) => ({ w: c.width, h: c.height }));
  const start = { x: r.x + r.width * 0.2, y: r.y + r.height * 0.08 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 50, start.y + 30, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: '选择模式', exact: true }).click();
  await page.mouse.click(start.x + 20, start.y + 15);
  await page.getByRole('region', { name: '选中标注设置' }).waitFor();
  await page.getByRole('spinbutton', { name: '标注 X 坐标' }).fill('30');
  await page.getByRole('button', { name: '删除此标注', exact: true }).click();
  assert.equal(await page.locator('[data-annotation-selection]').count(), 0);
  assert.ok(dims.w > 0 && dims.h > 0);
  console.log(
    'PASS: tool-independent export, anchored object selection, editing, deletion'
  );
  await page.waitForTimeout(1100);
  await page.reload();
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await canvas.waitFor();
  await dock.getByRole('button', { name: '美化', exact: true }).click();
  assert.equal(
    await page.getByRole('combobox').first().inputValue(),
    'iphone16pro'
  );
  console.log(
    'PASS: IndexedDB draft restores original files and complete project settings'
  );
  await waitForDraftImages(page, files.length);
  await dock.getByRole('button', { name: '素材', exact: true }).click();
  for (let i = 0; i < files.length; i++)
    await page
      .getByRole('button', { name: '移除图片', exact: true })
      .first()
      .click();
  await canvas.waitFor({ state: 'hidden' });
  await waitForDraftImages(page, 0);
  await page.keyboard.press('Control+z');
  await canvas.waitFor();
  await waitForDraftImages(page, 1);
  await page.getByRole('button', { name: '移除图片', exact: true }).click();
  await canvas.waitFor({ state: 'hidden' });
  await page.waitForTimeout(1000);
  await page.reload();
  assert.equal(
    await page.getByRole('button', { name: '恢复草稿', exact: true }).count(),
    0
  );
  console.log(
    'PASS: removing the last image clears its draft; undo saves the restored project'
  );
  const draftQueue = await page.evaluate(async () => {
    const { saveDraft, deleteDraft, loadDraft } =
      await import('/src/utils/drafts.ts');
    const { emptyProject } = await import('/src/utils/project.ts');
    const src = URL.createObjectURL(new Blob(['queued source']));
    const project = emptyProject();
    project.images = [
      {
        id: 'queued',
        src,
        name: 'queued.png',
        width: 1,
        height: 1,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
      },
    ];
    const originalFetch = window.fetch;
    let release, started;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const reading = new Promise((resolve) => {
      started = resolve;
    });
    window.fetch = async (...args) => {
      if (args[0] === src) {
        started();
        await gate;
      }
      return originalFetch(...args);
    };
    try {
      const saving = saveDraft(project);
      await reading;
      let deleted = false;
      const deleting = deleteDraft().then(() => {
        deleted = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const waitedForSave = !deleted;
      release();
      await Promise.all([saving, deleting]);
      const final = await loadDraft();
      if (final)
        for (const image of final.project.images)
          URL.revokeObjectURL(image.src);
      return { waitedForSave, empty: final === null };
    } finally {
      release();
      window.fetch = originalFetch;
      URL.revokeObjectURL(src);
    }
  });
  assert.deepEqual(draftQueue, { waitedForSave: true, empty: true });
  console.log('PASS: a slow pending save cannot resurrect a deleted draft');
  const nativeResults = await page.evaluate(async () => {
    const { downloadBlob } = await import('/src/utils/download.ts');
    const blob = new Blob(['native-test'], { type: 'image/png' });
    const results = [];
    for (const kind of ['success', 'failure', 'cancelled']) {
      window.AndroidApp = {
        saveFile: (_data, _mime, _name, id) =>
          queueMicrotask(() =>
            window.dispatchEvent(
              new CustomEvent('picsew-export-result', {
                detail: {
                  id,
                  success: kind === 'success',
                  cancelled: kind === 'cancelled',
                  message: kind,
                },
              })
            )
          ),
      };
      try {
        results.push(await downloadBlob(blob, 'image/png', 'fixture.png'));
      } catch (e) {
        results.push(e.name === 'AbortError' ? 'cancelled' : e.message);
      }
    }
    delete window.AndroidApp;
    return results;
  });
  assert.deepEqual(nativeResults, ['success', 'failure', 'cancelled']);
  const ignoresMalformed = await page.evaluate(async () => {
    const { downloadBlob } = await import('/src/utils/download.ts');
    window.AndroidApp = {
      saveFile: (_data, _mime, _name, id) => {
        window.dispatchEvent(
          new CustomEvent('picsew-export-result', { detail: null })
        );
        window.dispatchEvent(
          new CustomEvent('picsew-export-result', {
            detail: { id, success: 'yes', message: 42 },
          })
        );
        window.dispatchEvent(
          new CustomEvent('picsew-export-result', {
            detail: { id, success: true, message: 'saved' },
          })
        );
      },
    };
    try {
      return await downloadBlob(new Blob(['x']), 'image/png', 'fixture.png');
    } finally {
      delete window.AndroidApp;
    }
  });
  assert.equal(
    ignoresMalformed,
    'saved',
    'malformed bridge events cannot break a pending save'
  );

  console.log(
    'PASS: native save success, failure, and cancellation propagate to the web layer'
  );

  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto('http://127.0.0.1:4175/');
  await touchPage
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'touch.png',
      mimeType: 'image/png',
      buffer: Buffer.from(files[0], 'base64'),
    });
  const touchCanvas = touchPage.locator('.workspace-canvas canvas');
  await touchCanvas.waitFor();
  await touchPage.waitForTimeout(400);
  const beforePinch = await touchCanvas.boundingBox();
  const box = await touchPage.locator('.workspace-canvas').boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const cdp = await touchContext.newCDPSession(touchPage);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x - 20, y },
      { x: x + 20, y },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: x - 45, y },
      { x: x + 45, y },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const afterPinch = await touchCanvas.boundingBox();
  assert.ok(
    afterPinch.width > beforePinch.width * 1.5,
    'two-finger pinch zooms the canvas'
  );
  await touchContext.close();
  console.log('PASS: mobile two-finger canvas zoom');

  assert.deepEqual(pageErrors, [], 'no uncaught application errors');
  await context.close();
  // Production-only PWA: install the worker, launch offline, and accept a share POST.
  const offline = await browser.newContext();
  const app = await offline.newPage();
  await app.goto('http://127.0.0.1:4176/');
  await app.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await app.reload();
  await app.waitForFunction(() => !!navigator.serviceWorker.controller);
  await offline.setOffline(true);
  await app.reload();
  await app.getByRole('heading', { name: '多张截图，一张长图' }).waitFor();
  const share = await app.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const form = new FormData();
    form.append('images', blob, 'shared.png');
    const result = await fetch('./share-target', {
      method: 'POST',
      body: form,
    });
    return result.url;
  }, files[0]);
  assert.match(share, /share=/);
  await app.goto(share);
  await app.locator('.workspace-canvas canvas').waitFor({ timeout: 30000 });
  console.log(
    'PASS: production app shell works offline and imports a system share locally'
  );
  await app.waitForFunction(
    () => !new URL(location.href).searchParams.has('share')
  );
  const shareGuards = await app.evaluate(async (data) => {
    const svg = new FormData();
    svg.append(
      'images',
      new Blob(['<svg></svg>'], { type: 'image/svg+xml' }),
      'fake.svg'
    );
    const unsupported = await fetch('./share-target', {
      method: 'POST',
      body: svg,
    });
    const codes = [];
    for (let i = 0; i < 4; i++) {
      const form = new FormData();
      form.append(
        'images',
        await (await fetch(`data:image/png;base64,${data}`)).blob(),
        `pending-${i}.png`
      );
      const response = await fetch('./share-target', {
        method: 'POST',
        body: form,
      });
      codes.push(response.status);
    }
    return { unsupported: unsupported.status, codes };
  }, files[0]);
  assert.equal(
    shareGuards.unsupported,
    400,
    'active image formats cannot enter the share inbox'
  );
  assert.deepEqual(
    shareGuards.codes,
    [200, 200, 200, 409],
    'a full inbox rejects another batch without overwriting pending files'
  );
  console.log('PASS: share-target raster allowlist and bounded pending inbox');
  await app.goto('http://127.0.0.1:4176/');
  await app.locator('.workspace-canvas canvas').waitFor({ timeout: 30000 });
  await app.waitForFunction(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open('picsew-local', 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction('inbox', 'readonly'),
            q = tx.objectStore('inbox').count();
          tx.oncomplete = () => {
            resolve(q.result === 2);
            db.close();
          };
        };
      })
  );
  console.log(
    'PASS: reopening the app recovers an interrupted share and frees inbox capacity'
  );

  await offline.close();
} finally {
  await browser?.close();
  for (const server of servers)
    try {
      if (server.pid) process.kill(-server.pid, 'SIGTERM');
    } catch {}
}
