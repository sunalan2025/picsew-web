/* Local-only app shell and system share inbox. Never cache external requests. */
const CACHE = 'picsew-__CACHE_VERSION__';
const FILES = __PRECACHE_FILES__;
self.addEventListener('install', (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)))
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith('picsew-') && name !== CACHE)
          await caches.delete(name);
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
          const data = await event.request.formData();
          const files = data.getAll('images');
          if (
            !files.length ||
            files.length > 50 ||
            files.some(
              (file) =>
                !(file instanceof File) ||
                !file.type.startsWith('image/') ||
                file.size > 50 * 1024 * 1024
            )
          )
            return new Response('请选择最多 50 张图片，每张不超过 50 MB', {
              status: 400,
            });
          const id = crypto.randomUUID(),
            db = await database();
          await new Promise((resolve, reject) => {
            const tx = db.transaction('inbox', 'readwrite');
            tx.objectStore('inbox').put({ files, createdAt: Date.now() }, id);
            tx.oncomplete = resolve;
            tx.onabort = tx.onerror = () => reject(tx.error);
          });
          db.close();
          return Response.redirect(
            new URL(`./?share=${id}`, self.registration.scope).href,
            303
          );
        } catch {
          return new Response('无法接收分享，请打开应用后手动导入', {
            status: 500,
          });
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
      return fetch(event.request);
    })()
  );
});
