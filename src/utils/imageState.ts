import type { StitchedImage } from '../types';

/** Restore original screenshots and collapse nested split slices. */
export function restoreOriginalImages(images: StitchedImage[]): StitchedImage[] {
  const seen = new Set<string>();
  const result: StitchedImage[] = [];
  for (const image of images) {
    const id = image.originalId ?? image.id;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({
      ...image,
      id,
      originalId: undefined,
      cropTop: 0,
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0
    });
  }
  return result;
}
