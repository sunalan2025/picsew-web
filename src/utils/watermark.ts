import type { WatermarkConfig } from '../types';

/** Sparse watermark positions, with an upper bound even for very long screenshots. */
export function watermarkPositions(width: number, height: number, repeat: boolean): { x: number; y: number }[] {
  if (width <= 0 || height <= 0) return [];
  if (!repeat) return [{ x: width / 2, y: height / 2 }];
  const stepX = Math.max(240, width / 8);
  const stepY = Math.max(180, height / 9);
  const result: { x: number; y: number }[] = [];
  for (let y = stepY / 2; y < height && result.length < 100; y += stepY) {
    for (let x = stepX / 2; x < width && result.length < 100; x += stepX) {
      result.push({ x, y });
    }
  }
  return result;
}

export function drawWatermark(canvas: HTMLCanvasElement, config: WatermarkConfig): void {
  const label = config.text.trim().slice(0, 100);
  if (!config.enabled || !label) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const opacity = Math.max(0.01, Math.min(1, config.opacity));
  const size = Math.max(12, Math.min(140, config.size));
  const angle = Math.max(-75, Math.min(75, config.angle));
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = config.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
  for (const { x, y } of watermarkPositions(canvas.width, canvas.height, config.repeat)) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle * Math.PI / 180);
    ctx.fillText(label, 0, 0, Math.max(100, canvas.width * 0.72));
    ctx.restore();
  }
  ctx.restore();
}
