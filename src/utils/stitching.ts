/**
 * Seam detection for both vertical screenshots and horizontal photo strips.
 * Sources are decoded once by the caller; this function only samples a thin band.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读取失败'));
    img.src = src;
  });
}

export type StitchAxis = 'vertical' | 'horizontal';

let cachedCanvasA: HTMLCanvasElement | null = null;
let cachedCanvasB: HTMLCanvasElement | null = null;

/** Pure pixel matcher, independently testable without the browser Canvas API. */
export function findBestOverlapFromSamples(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  sampleSpan: number,
  maxOverlap: number,
  axis: StitchAxis
): number {
  const minOverlap = 40;
  if (maxOverlap < minOverlap || sampleSpan <= 0) return 0;
  let bestOverlap = 0;
  let bestScore = Infinity;

  // For vertical: rows on the bottom of A match rows at the top of B.
  // For horizontal: columns at the right of A match columns at the left of B.
  for (let v = minOverlap; v <= maxOverlap; v += 2) {
    let difference = 0;
    let comparisons = 0;
    if (axis === 'vertical') {
      for (let row = 0; row < v; row += 2) {
        const aOffset = (maxOverlap - v + row) * sampleSpan * 4;
        const bOffset = row * sampleSpan * 4;
        for (let x = 0; x < sampleSpan; x += 3) {
          const ia = aOffset + x * 4;
          const ib = bOffset + x * 4;
          difference += Math.abs(a[ia] - b[ib])
            + Math.abs(a[ia + 1] - b[ib + 1])
            + Math.abs(a[ia + 2] - b[ib + 2]);
          comparisons++;
        }
      }
    } else {
      for (let row = 0; row < sampleSpan; row += 3) {
        const rowOffset = row * maxOverlap * 4;
        for (let x = 0; x < v; x += 2) {
          const ia = rowOffset + (maxOverlap - v + x) * 4;
          const ib = rowOffset + x * 4;
          difference += Math.abs(a[ia] - b[ib])
            + Math.abs(a[ia + 1] - b[ib + 1])
            + Math.abs(a[ia + 2] - b[ib + 2]);
          comparisons++;
        }
      }
    }
    if (!comparisons) continue;
    // Discourage tiny incidental matches.
    const score = difference / comparisons + 50 / v;
    if (score < bestScore) {
      bestScore = score;
      bestOverlap = v;
    }
  }
  return bestScore <= 40 ? bestOverlap : 0;
}

export function detectOverlap(
  img1: HTMLImageElement | CanvasImageSource,
  img2: HTMLImageElement | CanvasImageSource,
  maxOverlapRatio = 1,
  axis: StitchAxis = 'vertical'
): number {
  const dimensions = (img: HTMLImageElement | CanvasImageSource) => {
    const el = img as HTMLImageElement;
    return {
      width: el.naturalWidth || (img as HTMLCanvasElement).width || 0,
      height: el.naturalHeight || (img as HTMLCanvasElement).height || 0
    };
  };
  const first = dimensions(img1);
  const second = dimensions(img2);
  const isVertical = axis === 'vertical';
  const axis1 = isVertical ? first.height : first.width;
  const axis2 = isVertical ? second.height : second.width;
  const orthogonal1 = isVertical ? first.width : first.height;
  const orthogonal2 = isVertical ? second.width : second.height;
  if (!axis1 || !axis2 || !orthogonal1 || !orthogonal2) return 0;

  const maxOverlap = Math.min(
    axis1, axis2, 600,
    Math.floor(axis1 * maxOverlapRatio), Math.floor(axis2 * maxOverlapRatio)
  );
  const sampleSpan = Math.min(120, orthogonal1, orthogonal2);
  if (maxOverlap < 40 || sampleSpan < 1) return 0;

  if (!cachedCanvasA) cachedCanvasA = document.createElement('canvas');
  if (!cachedCanvasB) cachedCanvasB = document.createElement('canvas');
  const canvasA = cachedCanvasA;
  const canvasB = cachedCanvasB;
  const w = isVertical ? sampleSpan : maxOverlap;
  const h = isVertical ? maxOverlap : sampleSpan;
  for (const canvas of [canvasA, canvasB]) {
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }
  const contextA = canvasA.getContext('2d', { willReadFrequently: true });
  const contextB = canvasB.getContext('2d', { willReadFrequently: true });
  if (!contextA || !contextB) return 0;
  contextA.clearRect(0, 0, w, h);
  contextB.clearRect(0, 0, w, h);

  if (isVertical) {
    const sourceXA = Math.floor((first.width - sampleSpan) / 2);
    const sourceXB = Math.floor((second.width - sampleSpan) / 2);
    contextA.drawImage(img1, sourceXA, first.height - maxOverlap, sampleSpan, maxOverlap, 0, 0, w, h);
    contextB.drawImage(img2, sourceXB, 0, sampleSpan, maxOverlap, 0, 0, w, h);
  } else {
    const sourceYA = Math.floor((first.height - sampleSpan) / 2);
    const sourceYB = Math.floor((second.height - sampleSpan) / 2);
    contextA.drawImage(img1, first.width - maxOverlap, sourceYA, maxOverlap, sampleSpan, 0, 0, w, h);
    contextB.drawImage(img2, 0, sourceYB, maxOverlap, sampleSpan, 0, 0, w, h);
  }

  return findBestOverlapFromSamples(
    contextA.getImageData(0, 0, w, h).data,
    contextB.getImageData(0, 0, w, h).data,
    sampleSpan, maxOverlap, axis
  );
}
