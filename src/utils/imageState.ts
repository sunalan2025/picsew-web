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

/** Clamp one crop edge without subtracting the edge being edited twice. */
export function clampCropValue(
  image: StitchedImage,
  field: 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight',
  requested: number
): number {
  const vertical = field === 'cropTop' || field === 'cropBottom';
  const opposite = field === 'cropTop' ? image.cropBottom
    : field === 'cropBottom' ? image.cropTop
    : field === 'cropLeft' ? image.cropRight : image.cropLeft;
  const dimension = vertical ? image.height : image.width;
  const maximum = Math.max(0, dimension - opposite - 10);
  return Math.min(maximum, Math.max(0, Number.isFinite(requested) ? Math.floor(requested) : 0));
}
