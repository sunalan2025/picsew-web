import type { EditorProject } from './project';
interface StoredProject {
  version: 1;
  savedAt: number;
  project: EditorProject;
  blobs: Record<string, Blob>;
}
export function openLocalDatabase(): Promise<IDBDatabase> {
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
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openLocalDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    const request = action(tx.objectStore('projects'));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('无法保存本地草稿'));
    };
  });
}
let queue: Promise<unknown> = Promise.resolve();
export function saveDraft(project: EditorProject): Promise<void> {
  const snapshot = structuredClone(project);
  const operation = queue
    .catch(() => {})
    .then(async () => {
      const blobs: Record<string, Blob> = {};
      for (const image of snapshot.images)
        if (!blobs[image.src]) {
          const response = await fetch(image.src);
          if (!response.ok) throw new Error('无法读取草稿图片');
          blobs[image.src] = await response.blob();
        }
      await transaction('readwrite', (store) =>
        store.put(
          {
            version: 1,
            savedAt: Date.now(),
            project: snapshot,
            blobs,
          } satisfies StoredProject,
          'current'
        )
      );
    });
  queue = operation;
  return operation;
}
export async function loadDraft(): Promise<{
  project: EditorProject;
  savedAt: number;
} | null> {
  const stored = await transaction<StoredProject | undefined>(
    'readonly',
    (store) => store.get('current')
  );
  if (!stored || stored.version !== 1) return null;
  const urls = new Map<string, string>();
  for (const [key, blob] of Object.entries(stored.blobs))
    urls.set(key, URL.createObjectURL(blob));
  return {
    savedAt: stored.savedAt,
    project: {
      ...stored.project,
      images: stored.project.images.map((image) => ({
        ...image,
        src: urls.get(image.src) ?? image.src,
      })),
    },
  };
}
export const deleteDraft = () =>
  transaction('readwrite', (store) => store.delete('current'));
