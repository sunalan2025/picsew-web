/* Local-only app shell and system share inbox. Never cache external requests. */
const CACHE = 'picsew-__CACHE_VERSION__';
const FILES = __PRECACHE_FILES__;
self.addEventListener('message', (event) => {
  if (event.data?.type === 'PICSEW_ACTIVATE_UPDATE')
    event.waitUntil(self.skipWaiting());
});
self.addEventListener('install', (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)))
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const old = (await caches.keys()).filter(
        (name) => name.startsWith('picsew-') && name !== CACHE
      );
      // Keep one previous build for tabs that are still editing or temporarily offline.
      const previous = old.at(-1);
      for (const name of old) if (name !== previous) await caches.delete(name);
      await self.clients.claim();
    })()
  )
);
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('picsew-local', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects');
      request.result.createObjectStore('inbox');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (
    event.request.method === 'POST' &&
    url.pathname === new URL('share-target', self.registration.scope).pathname
  ) {
    event.respondWith(
      (async () => {
        try {
          // Bound stored share payloads before they can consume the local inbox.
          if (
            Number(event.request.headers.get('content-length') || 0) >
            80 * 1024 * 1024
          )
            return new Response(
              '分享文件太多，请分批添加（总大小最多 80 MB）',
              { status: 413 }
            );
          const data = await event.request.formData();
          const files = data.getAll('images');
          if (
            !files.length ||
            files.length > 50 ||
            files.some(
              (file) =>
                !(file instanceof File) ||
                ![
                  'image/png',
                  'image/jpeg',
                  'image/webp',
                  'image/gif',
                ].includes(file.type) ||
                file.size > 50 * 1024 * 1024
            )
          )
            return new Response('请选择最多 50 张图片，每张不超过 50 MB', {
              status: 400,
            });
          if (
            files.reduce((total, file) => total + file.size, 0) >
            80 * 1024 * 1024
          )
            return new Response(
              '分享文件太多，请分批添加（总大小最多 80 MB）',
              { status: 413 }
            );
          const id = crypto.randomUUID(),
            db = await database();
          let inboxFull = false;
          try {
            await new Promise((resolve, reject) => {
              const tx = db.transaction('inbox', 'readwrite');
              const store = tx.objectStore('inbox');
              const count = store.count();
              count.onsuccess = () => {
                if (count.result >= 3) {
                  inboxFull = true;
                  tx.abort();
                  return;
                }
                store.put({ files, createdAt: Date.now() }, id);
              };
              tx.oncomplete = resolve;
              tx.onabort = tx.onerror = () => reject(tx.error);
            });
          } catch (error) {
            if (inboxFull)
              return new Response(
                '已有 3 组图片等待添加，请先打开应用处理，再分享下一组',
                { status: 409 }
              );
            throw error;
          } finally {
            db.close();
          }
          return Response.redirect(
            new URL(`./?share=${id}`, self.registration.scope).href,
            303
          );
        } catch {
          return new Response(
            '无法接收分享，请先打开应用处理待导入的图片，或从相册手动添加',
            {
              status: 500,
            }
          );
        }
      })()
    );
    return;
  }
  if (event.request.method !== 'GET') return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (event.request.mode === 'navigate') {
        try {
          const response = await fetch(event.request);
          if (response.ok) return response;
        } catch {}
        return (
          (await cache.match(
            new URL('index.html', self.registration.scope).href
          )) ||
          new Response('请联网打开一次应用以启用离线使用', { status: 503 })
        );
      }
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (
        url.pathname.startsWith(
          new URL('assets/', self.registration.scope).pathname
        )
      ) {
        const previous = await caches.match(event.request);
        if (previous) return previous;
      }
      return fetch(event.request);
    })()
  );
});
