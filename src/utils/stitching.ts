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

interface SampleCandidate { v: number; error: number }

/** Pure pixel matcher. Both buffers contain the final/initial edge band of size maxOverlap. */
export function analyzeOverlapSamples(
  a: Uint8ClampedArray, b: Uint8ClampedArray,
  sampleSpan: number, maxOverlap: number, axis: StitchAxis,
  scale = 1
): OverlapMatch {
  const empty: OverlapMatch = { overlap: 0, confidence: 'low', error: 255, uncertain: true };
  const width = axis === 'vertical' ? sampleSpan : maxOverlap;
  const height = axis === 'vertical' ? maxOverlap : sampleSpan;
  if (!Number.isFinite(scale) || scale <= 0 ||
      !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 8 || height < 8 || a.length !== width * height * 4 || b.length !== a.length) {
    return empty;
  }

  // Texture is crucial: a solid/monochrome screenshot has infinitely many
  // mathematically identical seams, so it should never be cropped automatically.
  let texture = 0;
  let textureCount = 0;
  for (let row = 2; row < height - 1; row += 4) {
    for (let col = 2; col < width - 1; col += 4) {
      const p = (row * width + col) * 4;
      const neighbor = axis === 'vertical' ? p - width * 4 : p - 4;
      texture += Math.abs(a[p] - a[neighbor]) +
        Math.abs(a[p + 1] - a[neighbor + 1]) +
        Math.abs(a[p + 2] - a[neighbor + 2]);
      textureCount++;
    }
  }
  // Sparse document screenshots contain broad white regions separated by thin
  // text strokes. A threshold of 3.4 rejected actual 8-image fixtures even
  // when the correct overlap had pixel-perfect zero error.
  if (!textureCount || texture / (textureCount * 3) < 1.2) return empty;

  const minimum = Math.max(5, Math.ceil(40 / scale));
  if (maxOverlap < minimum) return empty;

  const evaluate = (v: number): number => {
    const margin = Math.floor(v * 0.075);
    const from = margin;
    const to = v - margin;
    const stepAxis = Math.max(1, Math.floor((to - from) / 62));
    const rowErrors: number[] = [];
    for (let k = from; k < to; k += stepAxis) {
      let sum = 0;
      let count = 0;
      for (let orth = 2; orth < sampleSpan - 2; orth += 2) {
        const ia = axis === 'vertical'
          ? ((maxOverlap - v + k) * sampleSpan + orth) * 4
          : (orth * maxOverlap + (maxOverlap - v + k)) * 4;
        const ib = axis === 'vertical'
          ? (k * sampleSpan + orth) * 4
          : (orth * maxOverlap + k) * 4;
        sum += Math.abs(a[ia] - b[ib]) +
          Math.abs(a[ia + 1] - b[ib + 1]) +
          Math.abs(a[ia + 2] - b[ib + 2]);
        count++;
      }
      if (count) rowErrors.push(sum / (3 * count));
    }
    if (!rowErrors.length) return 255;
    // Ignore the worst 12% of rows. Screen-recording clocks, sticky
    // headers, and dynamic footers often disagree while body text matches.
    rowErrors.sort((x, y) => x - y);
    const keep = Math.max(1, Math.ceil(rowErrors.length * 0.88));
    let total = 0;
    for (let i = 0; i < keep; i++) total += rowErrors[i];
    return total / keep;
  };

  // Search at native scroll-axis resolution, without rounding seam coordinates.
  // Search EVERY possible displacement: a coarse stride can completely miss
  // the one correct offset in text-rich or JPEG-compressed screenshots,
  // especially with fixed navigation bars. 340 candidates remain inexpensive.
  const candidates: SampleCandidate[] = [];
  for (let v = minimum; v <= maxOverlap; v++) {
    candidates.push({ v, error: evaluate(v) });
  }
  // On sparse pages, short all-white bands can tie with the genuine seam
  // at zero error. Among equally exact offsets prefer the longer supported
  // region; long repetitive wallpaper still fails the ambiguity guard below.
  candidates.sort((x, y) => x.error - y.error || y.v - x.v);
  const best = candidates[0];
  // Compare non-neighbouring alternatives; repeated wallpapers produce many
  // similarly scored offsets and must NOT trigger destructive auto-cropping.
  const runner = candidates.find(x => Math.abs(x.v - best.v) >= 3);
  const marginScore = runner ? runner.error - best.error : 255;
  // A very short blank portion often looks like another "perfect" match.
  // Compare a pixel-exact long seam with competitors that span at least 55%
  // of its content. A repeated wallpaper has several such long ties and is
  // still rejected. For the real eight PNG test, the right seams have error 0
  // but the global runner gaps range from 0.005 to ~3.8 because of white space.
  const meaningfulRunner = candidates.find(x =>
    Math.abs(x.v - best.v) >= 3 && x.v >= Math.floor(best.v * 0.55));
  const exactLongMatch = scale === 1 &&
    best.error <= 0.15 &&
    best.v >= Math.max(minimum, Math.floor(maxOverlap * 0.20)) &&
    (!meaningfulRunner || meaningfulRunner.error - best.error >= 2.0);
  const high = exactLongMatch || (best.error <= 10 && marginScore >= 4);
  const medium = best.error <= 22 && marginScore >= 2.2;
  if (!high && !medium) return { ...empty, error: best.error };

  return {
    overlap: Math.round(best.v * scale),
    confidence: high ? 'high' : 'medium',
    error: best.error,
    uncertain: false
  };
}

/** Compatibility API used by the pre-existing UI and unit tests. */
export function findBestOverlapFromSamples(
  a: Uint8ClampedArray, b: Uint8ClampedArray,
  sampleSpan: number, maxOverlap: number, axis: StitchAxis
): number {
  return analyzeOverlapSamples(a, b, sampleSpan, maxOverlap, axis).overlap;
}

export function detectOverlapDetailed(
  img1: CanvasImageSource,
  img2: CanvasImageSource,
  maxOverlapRatio = 1,
  axis: StitchAxis = 'vertical'
): OverlapMatch {
  const empty: OverlapMatch = { overlap: 0, confidence: 'low', error: 255, uncertain: true };
  const dimensions = (source: CanvasImageSource) => {
    const image = source as HTMLImageElement;
    const canvas = source as HTMLCanvasElement;
    return { width: image.naturalWidth || canvas.width || 0, height: image.naturalHeight || canvas.height || 0 };
  };
  const first = dimensions(img1);
  const second = dimensions(img2);
  const isVertical = axis === 'vertical';
  const alongA = isVertical ? first.height : first.width;
  const alongB = isVertical ? second.height : second.width;
  const acrossA = isVertical ? first.width : first.height;
  const acrossB = isVertical ? second.width : second.height;
  if (!alongA || !alongB || acrossA < 8 || acrossB < 8) return empty;
  // Previous implementation capped this at 600 pixels. Typical 2K-tall
  // screen recordings may have >1500 pixels of genuine overlap.
  const maxOverlap = Math.min(3600, Math.floor(alongA * 0.97),
    Math.floor(alongB * 0.97), Math.floor(Math.min(alongA, alongB) * maxOverlapRatio));
  if (maxOverlap < 40) return empty;
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
  if (!ctxA || !ctxB) return empty;
  ctxA.clearRect(0, 0, width, height);
  ctxB.clearRect(0, 0, width, height);
  // Both samples have the SAME dimension, regardless of original image size.
  // Sample the central 80% of the orthogonal axis to avoid navigation rails.
  const crossA = Math.max(1, Math.floor(acrossA * 0.8));
  const crossB = Math.max(1, Math.floor(acrossB * 0.8));
  if (isVertical) {
    ctxA.drawImage(img1, (acrossA - crossA) / 2, alongA - maxOverlap,
      crossA, maxOverlap, 0, 0, width, height);
    ctxB.drawImage(img2, (acrossB - crossB) / 2, 0,
      crossB, maxOverlap, 0, 0, width, height);
  } else {
    ctxA.drawImage(img1, alongA - maxOverlap, (acrossA - crossA) / 2,
      maxOverlap, crossA, 0, 0, width, height);
    ctxB.drawImage(img2, 0, (acrossB - crossB) / 2,
      maxOverlap, crossB, 0, 0, width, height);
  }
  return analyzeOverlapSamples(
    ctxA.getImageData(0, 0, width, height).data,
    ctxB.getImageData(0, 0, width, height).data,
    sampleSpan, axisPixels, axis, scale
  );
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
  crop: {cropTop:number;cropBottom:number;cropLeft:number;cropRight:number}
): CanvasImageSource {
  const visible = getCropRect({
    width: source.naturalWidth, height: source.naturalHeight, ...crop
  });
  if (!crop.cropTop && !crop.cropBottom && !crop.cropLeft && !crop.cropRight) return source;
  if (visible.width < 10 || visible.height < 10) throw new Error('裁剪区域太小，无法自动对齐');
  const canvas = document.createElement('canvas');
  canvas.width = visible.width;
  canvas.height = visible.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建裁剪预览');
  context.drawImage(source, visible.left, visible.top, visible.width, visible.height,
    0, 0, visible.width, visible.height);
  return canvas;
}
