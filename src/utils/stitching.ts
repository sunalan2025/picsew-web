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

/**
 * Automatically detects the pixel overlap height between two images.
 * It takes a center vertical strip of both images to perform SSD (Sum of Squared Differences) matching.
 * Returns the best overlap height in pixels.
 */
export async function detectOverlap(
  imgA: HTMLImageElement,
  imgB: HTMLImageElement
): Promise<number> {
  const sampleWidth = 120; // Width of the sample strip in center
  const maxOverlap = Math.min(imgA.naturalHeight, imgB.naturalHeight, 600);
  const minOverlap = 40; // Minimum overlap to consider

  // Create temporary canvases to extract pixel data
  const canvasA = document.createElement('canvas');
  const canvasB = document.createElement('canvas');

  const ctxA = canvasA.getContext('2d');
  const ctxB = canvasB.getContext('2d');

  if (!ctxA || !ctxB) return 0;

  canvasA.width = sampleWidth;
  canvasA.height = maxOverlap;
  canvasB.width = sampleWidth;
  canvasB.height = maxOverlap;

  // Draw the bottom portion of image A
  const srcXA = Math.max(0, (imgA.naturalWidth - sampleWidth) / 2);
  const srcYA = imgA.naturalHeight - maxOverlap;
  ctxA.drawImage(
    imgA,
    srcXA, srcYA, sampleWidth, maxOverlap,
    0, 0, sampleWidth, maxOverlap
  );

  // Draw the top portion of image B
  const srcXB = Math.max(0, (imgB.naturalWidth - sampleWidth) / 2);
  ctxB.drawImage(
    imgB,
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
        const dr = dataA[pxA] - dataB[pxB];
        const dg = dataA[pxA + 1] - dataB[pxB + 1];
        const db = dataA[pxA + 2] - dataB[pxB + 2];

        diffSum += dr * dr + dg * dg + db * db;
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
  // 350 is a reasonable empirical threshold for average squared difference per color channel
  if (minDifference > 500) {
    return 0;
  }

  return bestOverlap;
}
