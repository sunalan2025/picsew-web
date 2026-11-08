/**
 * Image seam matcher (vertical or horizontal).
 *
 * Match downsampled edge bands; reject ambiguous low-texture content rather than
 * silently deleting incorrect rows. Samples are centred on the cross axis so
 * UI bars/side gutters have less influence than the scrolling article itself.
 */
import { getCropRect } from './imageState.ts';

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
export type MatchConfidence = 'high' | 'medium' | 'low';

export interface OverlapMatch {
  overlap: number;
  confidence: MatchConfidence;
  error: number;
  /** Indicates a repeated pattern, a blank background, or a poor match. */
  uncertain: boolean;
}

let cachedCanvasA: HTMLCanvasElement | null = null;
let cachedCanvasB: HTMLCanvasElement | null = null;

export { analyzeOverlapSamples } from './overlapSamples.ts';
import { analyzeOverlapSamples } from './overlapSamples.ts';
/** Compatibility API used by the pre-existing UI and unit tests. */
export function findBestOverlapFromSamples(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  sampleSpan: number,
  maxOverlap: number,
  axis: StitchAxis
): number {
  return analyzeOverlapSamples(a, b, sampleSpan, maxOverlap, axis).overlap;
}

function sampleOverlap(
  img1: CanvasImageSource,
  img2: CanvasImageSource,
  maxOverlapRatio = 1,
  axis: StitchAxis = 'vertical'
) {
  const dimensions = (source: CanvasImageSource) => {
    const image = source as HTMLImageElement;
    const canvas = source as HTMLCanvasElement;
    return {
      width: image.naturalWidth || canvas.width || 0,
      height: image.naturalHeight || canvas.height || 0,
    };
  };
  const first = dimensions(img1);
  const second = dimensions(img2);
  const isVertical = axis === 'vertical';
  const alongA = isVertical ? first.height : first.width;
  const alongB = isVertical ? second.height : second.width;
  const acrossA = isVertical ? first.width : first.height;
  const acrossB = isVertical ? second.width : second.height;
  if (!alongA || !alongB || acrossA < 8 || acrossB < 8) return null;
  // Previous implementation capped this at 600 pixels. Typical 2K-tall
  // screen recordings may have >1500 pixels of genuine overlap.
  const maxOverlap = Math.min(
    3600,
    Math.floor(((alongA * acrossB) / acrossA) * 0.97),
    Math.floor(alongB * 0.97),
    Math.floor(Math.min((alongA * acrossB) / acrossA, alongB) * maxOverlapRatio)
  );
  if (maxOverlap < 40) return null;
  // Preserve full native pixel resolution along the stitching direction.
  const axisPixels = maxOverlap;
  const sampleSpan = Math.min(96, acrossA, acrossB);
  const scale = 1;
  if (!cachedCanvasA) cachedCanvasA = document.createElement('canvas');
  if (!cachedCanvasB) cachedCanvasB = document.createElement('canvas');
  const a = cachedCanvasA;
  const b = cachedCanvasB;
  const width = isVertical ? sampleSpan : axisPixels;
  const height = isVertical ? axisPixels : sampleSpan;
  for (const canvas of [a, b]) {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }
  const ctxA = a.getContext('2d', { willReadFrequently: true });
  const ctxB = b.getContext('2d', { willReadFrequently: true });
  if (!ctxA || !ctxB) return null;
  ctxA.clearRect(0, 0, width, height);
  ctxB.clearRect(0, 0, width, height);
  // Both samples have the SAME dimension, regardless of original image size.
  // Sample the central 80% of the orthogonal axis to avoid navigation rails.
  const crossA = Math.max(1, Math.floor(acrossA * 0.8));
  const crossB = Math.max(1, Math.floor(acrossB * 0.8));
  if (isVertical) {
    ctxA.drawImage(
      img1,
      (acrossA - crossA) / 2,
      alongA - (maxOverlap * acrossA) / acrossB,
      crossA,
      (maxOverlap * acrossA) / acrossB,
      0,
      0,
      width,
      height
    );
    ctxB.drawImage(
      img2,
      (acrossB - crossB) / 2,
      0,
      crossB,
      maxOverlap,
      0,
      0,
      width,
      height
    );
  } else {
    ctxA.drawImage(
      img1,
      alongA - (maxOverlap * acrossA) / acrossB,
      (acrossA - crossA) / 2,
      (maxOverlap * acrossA) / acrossB,
      crossA,
      0,
      0,
      width,
      height
    );
    ctxB.drawImage(
      img2,
      0,
      (acrossB - crossB) / 2,
      maxOverlap,
      crossB,
      0,
      0,
      width,
      height
    );
  }
  return {
    a: ctxA.getImageData(0, 0, width, height).data,
    b: ctxB.getImageData(0, 0, width, height).data,
    span: sampleSpan,
    max: axisPixels,
    axis,
    scale,
  };
}

const noMatch = (): OverlapMatch => ({
  overlap: 0,
  confidence: 'low',
  error: 255,
  uncertain: true,
});
export function detectOverlapDetailed(
  img1: CanvasImageSource,
  img2: CanvasImageSource,
  maxOverlapRatio = 1,
  axis: StitchAxis = 'vertical'
): OverlapMatch {
  const s = sampleOverlap(img1, img2, maxOverlapRatio, axis);
  return s
    ? analyzeOverlapSamples(s.a, s.b, s.span, s.max, s.axis, s.scale)
    : noMatch();
}
/** Keep expensive candidate searches off the interaction thread. */
export async function detectOverlapAsync(
  img1: CanvasImageSource,
  img2: CanvasImageSource,
  maxOverlapRatio = 1,
  axis: StitchAxis = 'vertical'
): Promise<OverlapMatch> {
  const s = sampleOverlap(img1, img2, maxOverlapRatio, axis);
  if (!s) return noMatch();
  if (typeof Worker === 'undefined')
    return analyzeOverlapSamples(s.a, s.b, s.span, s.max, s.axis, s.scale);
  const worker = new Worker(new URL('./stitchWorker.ts', import.meta.url), {
    type: 'module',
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('接缝匹配超时，请手动精调'));
    }, 20000);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('接缝匹配失败'));
    };
    worker.postMessage(s, [s.a.buffer, s.b.buffer]);
  });
}

export function detectOverlap(
  img1: CanvasImageSource,
  img2: CanvasImageSource,
  maxOverlapRatio = 1,
  axis: StitchAxis = 'vertical'
): number {
  return detectOverlapDetailed(img1, img2, maxOverlapRatio, axis).overlap;
}

/** Return just the user's visible crop. Automatic stitching must match the
 * same pixels that the preview/export renders, not the uncropped originals. */
export function visibleImageSource(
  source: HTMLImageElement,
  crop: {
    cropTop: number;
    cropBottom: number;
    cropLeft: number;
    cropRight: number;
  }
): CanvasImageSource {
  const visible = getCropRect({
    width: source.naturalWidth,
    height: source.naturalHeight,
    ...crop,
  });
  if (!crop.cropTop && !crop.cropBottom && !crop.cropLeft && !crop.cropRight)
    return source;
  if (visible.width < 10 || visible.height < 10)
    throw new Error('裁剪区域太小，无法自动对齐');
  const canvas = document.createElement('canvas');
  canvas.width = visible.width;
  canvas.height = visible.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建裁剪预览');
  context.drawImage(
    source,
    visible.left,
    visible.top,
    visible.width,
    visible.height,
    0,
    0,
    visible.width,
    visible.height
  );
  return canvas;
}
