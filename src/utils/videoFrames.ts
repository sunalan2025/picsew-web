import type { StitchedImage } from '../types';

const PREVIEW_WIDTH = 48;
const PREVIEW_HEIGHT = 64;

export function planVideoSamples(duration: number, frameLimit: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || frameLimit < 1) return [];
  const count = Math.min(Math.floor(frameLimit), Math.max(1, Math.ceil(duration / 0.8) + 1));
  if (count === 1) return [Math.min(0.05, duration / 2)];
  // Leave a margin at the end; seeking exactly to duration may stall.
  const start = Math.min(0.05, duration / 4);
  const end = Math.max(start, duration - 0.08);
  return Array.from({ length: count }, (_, i) => start + (end - start) * i / (count - 1));
}

/** Average RGB difference in [0,255]; ignores alpha and uses small previews only. */
export function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (!a.length || a.length !== b.length || a.length % 4 !== 0) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / (a.length / 4 * 3);
}

function aborted(signal: AbortSignal): void {
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
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('读取录屏超时，请尝试缩短视频'));
    }, 10000);
    if (signal.aborted) { onAbort(); return; }
    try { onStart?.(); } catch (error) { cleanup(); reject(error); }
  });
}

async function seekFrame(video: HTMLVideoElement, seconds: number, signal: AbortSignal): Promise<void> {
  aborted(signal);
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      Math.abs(video.currentTime - seconds) < 0.002) return;
  await awaitMediaEvent(video, 'seeked', signal, () => { video.currentTime = seconds; });
  aborted(signal);
}

export interface VideoExtractionResult {
  images: StitchedImage[];
  considered: number;
  duration: number;
}

export async function extractVideoFrames(
  file: File,
  maxFrames: number,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void
): Promise<VideoExtractionResult> {
  aborted(signal);
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
    await awaitMediaEvent(video, 'loadedmetadata', signal, () => {
      video.src = url;
      video.load();
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180) {
      throw new Error('仅支持 3 分钟以内的录屏；更长录屏请分段导入');
    }
    const originalW = video.videoWidth;
    const originalH = video.videoHeight;
    if (!originalW || !originalH || originalW * originalH > 25000000) {
      throw new Error('录屏分辨率过高或不受支持');
    }
    const ratio = Math.min(1, 1080 / originalW, 2400 / originalH);
    const width = Math.max(1, Math.round(originalW * ratio));
    const height = Math.max(1, Math.round(originalH * ratio));
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const frameCtx = frameCanvas.getContext('2d', { alpha: false });
    const compareCanvas = document.createElement('canvas');
    compareCanvas.width = PREVIEW_WIDTH;
    compareCanvas.height = PREVIEW_HEIGHT;
    const compareCtx = compareCanvas.getContext('2d', { willReadFrequently: true });
    if (!frameCtx || !compareCtx) throw new Error('浏览器无法创建视频帧画布');

    const times = planVideoSamples(duration, Math.min(40, maxFrames));
    const images: StitchedImage[] = [];
    let previousPreview: Uint8ClampedArray | null = null;
    for (let i = 0; i < times.length; i++) {
      aborted(signal);
      await seekFrame(video, times[i], signal);
      frameCtx.drawImage(video, 0, 0, width, height);
      compareCtx.drawImage(video, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      const currentPreview = compareCtx.getImageData(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT).data;
      const changed = !previousPreview || frameDifference(previousPreview, currentPreview) >= 3.2;
      if (changed) {
        images.push({
          id: crypto.randomUUID(),
          name: `${file.name.replace(/\.[^.]+$/, '')} · ${(times[i]).toFixed(1)}s`,
          src: frameCanvas.toDataURL('image/jpeg', 0.86),
          width,
          height,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0
        });
        previousPreview = new Uint8ClampedArray(currentPreview);
      }
      onProgress(i + 1, times.length);
    }
    aborted(signal);
    return { images, considered: times.length, duration };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
