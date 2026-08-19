/**
 * Helper to load an image URL into an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

let cachedCanvasA: HTMLCanvasElement | null = null;
let cachedCanvasB: HTMLCanvasElement | null = null;

/**
 * Automatically detects the pixel overlap height between two images.
 * It takes a center vertical strip of both images to perform MAD (Mean Absolute Difference) matching.
 * Returns the best overlap height in pixels.
 */
export function detectOverlap(
  img1: HTMLImageElement | CanvasImageSource,
  img2: HTMLImageElement | CanvasImageSource,
  maxOverlapRatio?: number
): number {
  const sampleWidth = 120; // Width of the sample strip in center

  const getWidth = (img: any) => img.naturalWidth || img.videoWidth || img.width;
  const getHeight = (img: any) => img.naturalHeight || img.videoHeight || img.height;

  const width1 = getWidth(img1);
  const height1 = getHeight(img1);
  const width2 = getWidth(img2);
  const height2 = getHeight(img2);

  const ratio = maxOverlapRatio !== undefined ? maxOverlapRatio : 1.0;
  const maxOverlap = Math.min(height1, height2, 600, Math.floor(height1 * ratio), Math.floor(height2 * ratio));
  const minOverlap = 40; // Minimum overlap to consider

  if (maxOverlap < minOverlap) return 0;

  // Create temporary canvases to extract pixel data
  if (!cachedCanvasA) cachedCanvasA = document.createElement('canvas');
  if (!cachedCanvasB) cachedCanvasB = document.createElement('canvas');

  const canvasA = cachedCanvasA;
  const canvasB = cachedCanvasB;

  const ctxA = canvasA.getContext('2d', { willReadFrequently: true });
  const ctxB = canvasB.getContext('2d', { willReadFrequently: true });

  if (!ctxA || !ctxB) return 0;

  // Conditionally update canvas width/height to avoid expensive buffer re-allocation
  let resizedA = false;
  if (canvasA.width !== sampleWidth) { canvasA.width = sampleWidth; resizedA = true; }
  if (canvasA.height !== maxOverlap) { canvasA.height = maxOverlap; resizedA = true; }
  if (!resizedA) ctxA.clearRect(0, 0, sampleWidth, maxOverlap);

  let resizedB = false;
  if (canvasB.width !== sampleWidth) { canvasB.width = sampleWidth; resizedB = true; }
  if (canvasB.height !== maxOverlap) { canvasB.height = maxOverlap; resizedB = true; }
  if (!resizedB) ctxB.clearRect(0, 0, sampleWidth, maxOverlap);

  // Draw the bottom portion of image 1
  const srcXA = Math.max(0, (width1 - sampleWidth) / 2);
  const srcYA = height1 - maxOverlap;
  ctxA.drawImage(
    img1,
    srcXA, srcYA, sampleWidth, maxOverlap,
    0, 0, sampleWidth, maxOverlap
  );

  // Draw the top portion of image 2
  const srcXB = Math.max(0, (width2 - sampleWidth) / 2);
  ctxB.drawImage(
    img2,
    srcXB, 0, sampleWidth, maxOverlap,
    0, 0, sampleWidth, maxOverlap
  );

  const imgDataA = ctxA.getImageData(0, 0, sampleWidth, maxOverlap);
  const imgDataB = ctxB.getImageData(0, 0, sampleWidth, maxOverlap);

  const dataA = imgDataA.data;
  const dataB = imgDataB.data;

  let bestOverlap = 0;
  let minDifference = Infinity;

  // Sliding window: test overlaps of size 'v' (in pixels)
  // When overlap is 'v', we compare:
  // - Bottom 'v' rows of A (starting from index 'maxOverlap - v' in our sample canvas)
  // - Top 'v' rows of B (starting from index 0 in our sample canvas)
  for (let v = minOverlap; v < maxOverlap; v += 2) {
    let diffSum = 0;
    let comparisons = 0;

    // For speed, sample every 2nd row and every 3rd pixel
    for (let y = 0; y < v; y += 2) {
      const rowA = maxOverlap - v + y;
      const rowB = y;

      const offsetA = rowA * sampleWidth * 4;
      const offsetB = rowB * sampleWidth * 4;

      for (let x = 0; x < sampleWidth; x += 3) {
        const pxA = offsetA + x * 4;
        const pxB = offsetB + x * 4;

        // R, G, B channels
        const dr = Math.abs(dataA[pxA] - dataB[pxB]);
        const dg = Math.abs(dataA[pxA + 1] - dataB[pxB + 1]);
        const db = Math.abs(dataA[pxA + 2] - dataB[pxB + 2]);

        diffSum += dr + dg + db;
        comparisons++;
      }
    }

    const averageDiff = diffSum / comparisons;
    
    // We want the minimum average difference. We also apply a small penalty for 
    // extremely small overlaps to avoid false positives on solid backgrounds.
    const penalty = 50 / v;
    const score = averageDiff + penalty;

    if (score < minDifference) {
      minDifference = score;
      bestOverlap = v;
    }
  }

  // If the match difference is too high, it's likely they don't overlap
  // 40 is a reasonable empirical threshold for average absolute difference for 3 color channels
  if (minDifference > 40) {
    return 0;
  }

  return bestOverlap;
}
