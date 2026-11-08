import { openLocalDatabase } from './drafts';
export async function readIncomingShare(): Promise<{
  id: string;
  files: File[];
} | null> {
  const id = new URL(location.href).searchParams.get('share');
  if (!id) return null;
  const db = await openLocalDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('inbox', 'readonly');
      const request = tx.objectStore('inbox').get(id);
      tx.oncomplete = () =>
        resolve(request.result ? { id, files: request.result.files } : null);
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
