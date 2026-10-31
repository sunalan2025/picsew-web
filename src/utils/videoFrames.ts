import type { StitchedImage } from '../types';

const PREVIEW_WIDTH = 64;
const PREVIEW_HEIGHT = 96;
const MAX_SCAN_FRAMES = 480;
const MAX_REFINEMENTS = 48;

/** Legacy sampling helper retained for compatibility with older tests. */
export function planVideoSamples(duration: number, frameLimit: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || frameLimit < 1) return [];
  const count = Math.min(Math.floor(frameLimit), Math.max(1, Math.ceil(duration / 0.8) + 1));
  if (count === 1) return [Math.min(0.05, duration / 2)];
  const start = Math.min(0.05, duration / 4);
  const end = Math.max(start, duration - 0.08);
  return Array.from({ length: count }, (_, i) => start + (end - start) * i / (count - 1));
}

/** Scan video ~4 times per second, independently of the number of *kept* frames. */
export function planVideoScanTimes(duration: number, limit = MAX_SCAN_FRAMES): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(limit) || limit < 2) return [];
  const start = Math.min(0.04, duration / 5);
  const end = Math.max(start, duration - 0.075);
  const count = Math.max(2, Math.min(Math.floor(limit), Math.ceil(duration / 0.25) + 1));
  return Array.from({ length: count }, (_, i) => start + (end - start) * i / (count - 1));
}

/** Mean RGB difference, alpha excluded. */
export function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (!a.length || a.length !== b.length || a.length % 4 !== 0) return 255;
  let total = 0;
  for (let i = 0; i < a.length; i += 4) {
    total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return total / (a.length / 4 * 3);
}

export interface ScrollMotion {
  /** Positive means scrolling down; negative indicates reverse movement. */
  shift: number;
  confidence: 'high' | 'medium' | 'low';
  error: number;
}

/** Determine vertical scrolling distance between two tiny RGBA previews. */
export function estimateScrollMotion(
  before: Uint8ClampedArray, after: Uint8ClampedArray,
  width: number, height: number
): ScrollMotion {
  const unknown: ScrollMotion = { shift: 0, confidence: 'low', error: 255 };
  if (width < 16 || height < 24 || before.length !== width * height * 4 || after.length !== before.length) {
    return unknown;
  }
  const x0 = Math.floor(width * 0.18);
  const x1 = Math.ceil(width * 0.82);
  const margin = Math.max(3, Math.floor(height * 0.10));
  const maxShift = Math.floor(height * 0.64);
  // Content must have actual texture; a plain screen can never provide a
  // unique displacement, even if its pixel difference appears to be zero.
  let texture = 0, texN = 0;
  for (let y = margin + 2; y < height - margin; y += 3) {
    for (let x = x0 + 2; x < x1 - 1; x += 3) {
      const p = (y * width + x) * 4, prev = p - width * 4;
      texture += Math.abs(before[p] - before[prev]) +
        Math.abs(before[p + 1] - before[prev + 1]) +
        Math.abs(before[p + 2] - before[prev + 2]);
      texN++;
    }
  }
  if (!texN || texture / (texN * 3) < 3.0) return unknown;

  const candidates: { shift: number; score: number }[] = [];
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    const begin = Math.max(margin, margin - shift);
    const end = Math.min(height - margin, height - margin - shift);
    if (end - begin < 13) continue;
    const rows: number[] = [];
    for (let y = begin; y < end; y += 2) {
      let diff = 0, samples = 0;
      for (let x = x0; x < x1; x += 2) {
        const a = ((y + shift) * width + x) * 4;
        const b = (y * width + x) * 4;
        diff += Math.abs(before[a] - after[b]) +
          Math.abs(before[a + 1] - after[b + 1]) +
          Math.abs(before[a + 2] - after[b + 2]);
        samples++;
      }
      if (samples) rows.push(diff / (3 * samples));
    }
    rows.sort((a, b) => a - b);
    const keep = Math.max(1, Math.ceil(rows.length * 0.86));
    const score = rows.slice(0, keep).reduce((s, x) => s + x, 0) / keep;
    candidates.push({ shift, score });
  }
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];
  if (!best) return unknown;
  const runner = candidates.find(c => Math.abs(c.shift - best.shift) >= 3);
  const gap = runner ? runner.score - best.score : 255;
  if (best.score <= 11 && gap >= 3.4) {
    return { shift: best.shift, confidence: 'high', error: best.score };
  }
  if (best.score <= 22 && gap >= 2.0) {
    return { shift: best.shift, confidence: 'medium', error: best.score };
  }
  return { ...unknown, error: best.score };
}

export function shouldKeepScrollFrame(motion: ScrollMotion, atEnd = false): boolean {
  if (motion.confidence === 'low' || motion.shift < 0) return false;
  return motion.shift >= (atEnd ? 5 : 18);
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('用户已取消', 'AbortError');
}

function awaitMediaEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'seeked',
  signal: AbortSignal,
  onStart?: () => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      video.removeEventListener(eventName, onSuccess);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      if (timer) clearTimeout(timer);
    };
    const onSuccess = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('无法解码录屏，请尝试 MP4 或 WebM')); };
    const onAbort = () => { cleanup(); reject(new DOMException('用户已取消', 'AbortError')); };
    video.addEventListener(eventName, onSuccess, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error('录屏解码超时，请尝试缩短视频')); }, 12000);
    if (signal.aborted) { onAbort(); return; }
    try { onStart?.(); } catch (error) { cleanup(); reject(error); }
  });
}

async function seekFrame(video: HTMLVideoElement, seconds: number, signal: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      Math.abs(video.currentTime - seconds) < 0.002) return;
  await awaitMediaEvent(video, 'seeked', signal, () => { video.currentTime = seconds; });
  assertNotAborted(signal);
}

export interface VideoExtractionResult {
  images: StitchedImage[];
  considered: number;
  duration: number;
  /** Number of transitions where there was no reliable scroll match. */
  uncertainTransitions: number;
  /** True if the frame limit was reached before the video was fully examined. */
  truncated: boolean;
}

export async function extractVideoFrames(
  file: File,
  maxFrames: number,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void
): Promise<VideoExtractionResult> {
  assertNotAborted(signal);
  if (maxFrames < 1) throw new Error('图片数量已达到上限，请先移除部分图片');
  if (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm)$/i.test(file.name)) {
    throw new Error('请选择浏览器支持的视频文件');
  }
  if (file.size > 300 * 1024 * 1024) throw new Error('录屏文件不能超过 300 MB');
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(file);
  try {
    await awaitMediaEvent(video, 'loadedmetadata', signal, () => { video.src = url; video.load(); });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180) {
      throw new Error('仅支持 3 分钟以内的录屏；更长录屏请分段导入');
    }
    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    if (!originalWidth || !originalHeight || originalWidth * originalHeight > 25_000_000) {
      throw new Error('录屏分辨率过高或不受支持');
    }
    const ratio = Math.min(1, 1080 / originalWidth, 2400 / originalHeight);
    const width = Math.max(1, Math.round(originalWidth * ratio));
    const height = Math.max(1, Math.round(originalHeight * ratio));
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const frameCtx = frameCanvas.getContext('2d', { alpha: false });
    const compareCanvas = document.createElement('canvas');
    compareCanvas.width = PREVIEW_WIDTH;
    compareCanvas.height = PREVIEW_HEIGHT;
    const compareCtx = compareCanvas.getContext('2d', { willReadFrequently: true });
    if (!frameCtx || !compareCtx) throw new Error('浏览器无法创建视频帧画布');

    const scanTimes = planVideoScanTimes(duration);
    const images: StitchedImage[] = [];
    let considered = 0;
    let refinements = 0;
    let uncertainTransitions = 0;
    let truncated = false;
    let previousAccepted: Uint8ClampedArray | null = null;
    let acceptedTime = 0;
    const makeImage = (time: number): void => {
      frameCtx.drawImage(video, 0, 0, width, height);
      images.push({
        id: crypto.randomUUID(),
        name: `${file.name.replace(/\.[^.]+$/, '')} · ${time.toFixed(1)}s`,
        src: frameCanvas.toDataURL('image/jpeg', 0.90),
        width, height,
        cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0
      });
    };

    for (let i = 0; i < scanTimes.length; i++) {
      assertNotAborted(signal);
      const time = scanTimes[i];
      await seekFrame(video, time, signal);
      compareCtx.drawImage(video, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      const current = compareCtx.getImageData(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT).data;
      considered++;
      if (!previousAccepted) {
        makeImage(time);
        previousAccepted = new Uint8ClampedArray(current);
        acceptedTime = time;
      } else {
        const motion = estimateScrollMotion(previousAccepted, current, PREVIEW_WIDTH, PREVIEW_HEIGHT);
        const changed = frameDifference(previousAccepted, current);
        const endFrame = i === scanTimes.length - 1;
        // A fast scroll can jump beyond the matchable content region.
        // Retry the midpoint before allowing a discontinuity.
        const mayHaveLostContent = changed > 4 && (
          (motion.confidence === 'low') || motion.shift >= PREVIEW_HEIGHT * 0.50
        );
        if (mayHaveLostContent && refinements < MAX_REFINEMENTS &&
            scanTimes.length < MAX_SCAN_FRAMES + MAX_REFINEMENTS &&
            time - acceptedTime >= 0.18) {
          const middle = (acceptedTime + time) / 2;
          if (middle > acceptedTime + 0.065 && middle < time - 0.065) {
            scanTimes.splice(i, 0, middle);
            refinements++;
            // This loop will revisit the current time after evaluating midpoint.
            onProgress(i, scanTimes.length);
            continue;
          }
        }
        if (shouldKeepScrollFrame(motion, endFrame)) {
          if (images.length >= maxFrames) {
            truncated = true;
            break;
          }
          makeImage(time);
          previousAccepted = new Uint8ClampedArray(current);
          acceptedTime = time;
        } else if (motion.confidence === 'low' && changed > 8) {
          // Content likely changed but could not be aligned; retain it so the
          // user can correct the join instead of silently losing text.
          uncertainTransitions++;
          if (images.length >= maxFrames) {
            truncated = true;
            break;
          }
          makeImage(time);
          previousAccepted = new Uint8ClampedArray(current);
          acceptedTime = time;
        }
      }
      onProgress(i + 1, scanTimes.length);
    }
    assertNotAborted(signal);
    return { images, considered, duration, uncertainTransitions, truncated };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
