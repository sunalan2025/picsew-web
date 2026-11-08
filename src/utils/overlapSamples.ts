import type { StitchAxis, OverlapMatch } from './stitching';
interface SampleCandidate {
  v: number;
  error: number;
}

/** Pure pixel matcher. Both buffers contain the final/initial edge band of size maxOverlap. */
export function analyzeOverlapSamples(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  sampleSpan: number,
  maxOverlap: number,
  axis: StitchAxis,
  scale = 1
): OverlapMatch {
  const empty: OverlapMatch = {
    overlap: 0,
    confidence: 'low',
    error: 255,
    uncertain: true,
  };
  const width = axis === 'vertical' ? sampleSpan : maxOverlap;
  const height = axis === 'vertical' ? maxOverlap : sampleSpan;
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 8 ||
    height < 8 ||
    a.length !== width * height * 4 ||
    b.length !== a.length
  ) {
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
      texture +=
        Math.abs(a[p] - a[neighbor]) +
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
        const ia =
          axis === 'vertical'
            ? ((maxOverlap - v + k) * sampleSpan + orth) * 4
            : (orth * maxOverlap + (maxOverlap - v + k)) * 4;
        const ib =
          axis === 'vertical'
            ? (k * sampleSpan + orth) * 4
            : (orth * maxOverlap + k) * 4;
        sum +=
          Math.abs(a[ia] - b[ib]) +
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
  const runner = candidates.find((x) => Math.abs(x.v - best.v) >= 3);
  const marginScore = runner ? runner.error - best.error : 255;
  // A very short blank portion often looks like another "perfect" match.
  // Compare a pixel-exact long seam with competitors that span at least 55%
  // of its content. A repeated wallpaper has several such long ties and is
  // still rejected. For the real eight PNG test, the right seams have error 0
  // but the global runner gaps range from 0.005 to ~3.8 because of white space.
  const meaningfulRunner = candidates.find(
    (x) => Math.abs(x.v - best.v) >= 3 && x.v >= Math.floor(best.v * 0.55)
  );
  const exactLongMatch =
    scale === 1 &&
    best.error <= 0.15 &&
    best.v >= Math.max(minimum, Math.floor(maxOverlap * 0.2)) &&
    (!meaningfulRunner || meaningfulRunner.error - best.error >= 2.0);
  const high = exactLongMatch || (best.error <= 10 && marginScore >= 4);
  const medium = best.error <= 22 && marginScore >= 2.2;
  if (!high && !medium) return { ...empty, error: best.error };

  return {
    overlap: Math.round(best.v * scale),
    confidence: high ? 'high' : 'medium',
    error: best.error,
    uncertain: false,
  };
}
