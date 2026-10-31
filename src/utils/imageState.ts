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

/** Reorder safely by stable IDs instead of thumbnail array indices. */
export function reorderImages(images: StitchedImage[], sourceId: string, targetId: string): StitchedImage[] {
  const from = images.findIndex(image => image.id === sourceId);
  const to = images.findIndex(image => image.id === targetId);
  if (from < 0 || to < 0 || from === to) return images;
  const changed = [...images];
  const [item] = changed.splice(from, 1);
  changed.splice(to, 0, item);
  return changed;
}

/** Avoid negative canvas geometry after aggressive per-image cropping.
 * Overlap for a join is measured in the *next* slice's source pixels.
 * Both images are independently normalized to the same cross-axis width. */
export function clampOverlapsToVisibleImages(
  images: StitchedImage[], overlaps: number[], direction: 'vertical'|'horizontal'
): number[] {
  const vertical = direction === 'vertical';
  const along = (img:StitchedImage) => vertical
    ? Math.max(10, img.height-img.cropTop-img.cropBottom)
    : Math.max(10, img.width-img.cropLeft-img.cropRight);
  const across = (img:StitchedImage) => vertical
    ? Math.max(10, img.width-img.cropLeft-img.cropRight)
    : Math.max(10, img.height-img.cropTop-img.cropBottom);
  return Array.from({length:Math.max(0, images.length-1)},(_,i)=>{
    const previous=images[i], next=images[i+1];
    const nextLimit=along(next)-1;
    const prevLimit=along(previous)*across(next)/across(previous)-1;
    return Math.min(Math.max(0, Math.floor(overlaps[i]??0)),
      Math.max(0,Math.floor(Math.min(nextLimit,prevLimit))));
  });
}

/** Canonical original-pixel crop used by the editor AND Canvas drawImage.
 * Keeping one rectangle model avoids a visually different editor preview. */
export function getCropRect(image: StitchedImage): { left:number; top:number; width:number; height:number } {
  return {
    left: image.cropLeft,
    top: image.cropTop,
    width: Math.max(0, image.width - image.cropLeft - image.cropRight),
    height: Math.max(0, image.height - image.cropTop - image.cropBottom)
  };
}

/** The shade on the editor and source rectangle for Canvas drawImage are identical. */
export function getCropFractions(image: StitchedImage) {
  const rect = getCropRect(image);
  return { top: rect.top / image.height, bottom: image.cropBottom / image.height,
    left: rect.left / image.width, right: image.cropRight / image.width };
}

/** Locate a source screenshot within the normalized stitched output.
 * Uses the same per-image scale/overlap/gap convention as PreviewCanvas.
 * Helpful for keeping the edited image visible in the live long screenshot. */
export function getStitchedImageLocation(
  images: StitchedImage[], overlaps: number[], gap: number,
  axis: 'vertical' | 'horizontal', targetIndex: number
): { start:number; total:number } {
  if (!images.length) return { start:0, total:0 };
  const vertical = axis === 'vertical';
  const cross = (img:StitchedImage) => vertical
    ? Math.max(10,img.width-img.cropLeft-img.cropRight)
    : Math.max(10,img.height-img.cropTop-img.cropBottom);
  const along = (img:StitchedImage) => vertical
    ? Math.max(10,img.height-img.cropTop-img.cropBottom)
    : Math.max(10,img.width-img.cropLeft-img.cropRight);
  const firstCross = Math.max(50,cross(images[0]));
  let end = 0, start = 0, targetStart=0;
  for(let i=0;i<images.length;i++) {
    const scale = firstCross / cross(images[i]);
    start = i===0 ? 0 : end-(overlaps[i-1]??0)*scale+gap;
    if(i===targetIndex) targetStart=start;
    end = start+along(images[i])*scale;
  }
  return {start:targetStart,total:Math.max(1,end)};
}
