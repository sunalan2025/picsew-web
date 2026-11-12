import { openLocalDatabase } from './drafts';
export async function readIncomingShare(): Promise<{
  id: string;
  files: File[];
} | null> {
  const id = new URL(location.href).searchParams.get('share');
  const db = await openLocalDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('inbox', 'readonly');
      const store = tx.objectStore('inbox');
      if (id) {
        const request = store.get(id);
        tx.oncomplete = () =>
          resolve(request.result ? { id, files: request.result.files } : null);
      } else {
        // Recover an interrupted OS share without requiring the old redirect URL.
        const request = store.openCursor();
        let oldest: { id: string; files: File[]; createdAt: number } | null =
          null;
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const value = cursor.value;
          if (
            Array.isArray(value.files) &&
            (!oldest || value.createdAt < oldest.createdAt)
          )
            oldest = {
              id: String(cursor.key),
              files: value.files,
              createdAt: value.createdAt,
            };
          cursor.continue();
        };
        tx.oncomplete = () =>
          resolve(oldest ? { id: oldest.id, files: oldest.files } : null);
      }
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function acknowledgeIncomingShare(id: string) {
  const db = await openLocalDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('inbox', 'readwrite');
    tx.objectStore('inbox').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const url = new URL(location.href);
  url.searchParams.delete('share');
  history.replaceState(null, '', url);
}
