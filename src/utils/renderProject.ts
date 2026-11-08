import type { EditorProject } from './project';
import { getStitchedLayout } from './imageState';
import { drawAnchoredAnnotations, mapAnnotation } from './annotations';
import { loadImage } from './stitching';
import { drawStatusBar } from './statusBar';
import { drawMockup, mockupOutputSize } from './mockup';
import { drawWatermark } from './watermark';

export const MAX_RENDER_PIXELS = 32_000_000;
export function assertCanvasBudget(width: number, height: number) {
  if (width > 30000 || height > 30000 || width * height > MAX_RENDER_PIXELS)
    throw new Error('成品尺寸过大，请减小导出宽度或分段导出。');
}
/** Pure final composition. Editing guides, hover marks and tool state never enter this renderer. */
export async function renderProject(
  project: EditorProject,
  region?: { y: number; height: number; padded?: boolean }
): Promise<HTMLCanvasElement> {
  const layout = getStitchedLayout(
    project.images,
    project.overlaps,
    project.gap,
    project.direction
  );
  const requested = project.exportConfig.width || layout.width;
  const ratio = Math.min(1, requested / layout.width);
  if (region && project.mockup.device !== 'none')
    throw new Error('超长套壳请减小导出宽度后导出');
  if (region && !region.padded) {
    const fullHeight = Math.max(1, Math.floor(layout.height * ratio));
    if (
      !Number.isInteger(region.y) ||
      !Number.isInteger(region.height) ||
      region.y < 0 ||
      region.height < 1 ||
      region.y + region.height > fullHeight
    )
      throw new Error('分段导出范围无效');
    // Include neighboring pixels so blur and mosaic kernels match full-image rendering at tile boundaries.
    const start = Math.max(0, region.y - 64),
      end = Math.min(fullHeight, region.y + region.height + 64);
    const buffer = await renderProject(project, {
      y: start,
      height: end - start,
      padded: true,
    });
    const tile = document.createElement('canvas');
    tile.width = buffer.width;
    tile.height = region.height;
    tile
      .getContext('2d')!
      .drawImage(
        buffer,
        0,
        region.y - start,
        tile.width,
        tile.height,
        0,
        0,
        tile.width,
        tile.height
      );
    buffer.width = buffer.height = 0;
    return tile;
  }
  const offset = region?.y ?? 0;
  const outputHeight =
    region?.height ?? Math.max(1, Math.floor(layout.height * ratio));
  assertCanvasBudget(Math.ceil(layout.width * ratio), outputHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(layout.width * ratio));
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建成品画布');
  ctx.fillStyle = '#0f0f12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(0, -offset);
  ctx.scale(ratio, ratio);
  for (const pos of layout.placements) {
    if (
      (pos.y + pos.height) * ratio < offset ||
      pos.y * ratio > offset + outputHeight
    )
      continue;
    const source = await loadImage(pos.image.src);
    ctx.drawImage(
      source,
      pos.crop.left,
      pos.crop.top,
      pos.crop.width,
      pos.crop.height,
      pos.x,
      pos.y,
      pos.width,
      pos.height
    );
    // Release this decoded image before loading another one.
    source.src = '';
  }
  if (project.statusBar.enabled && project.direction === 'vertical')
    drawStatusBar(
      ctx,
      layout.width,
      Math.round(layout.width * 0.05),
      project.statusBar
    );
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(0, -offset);
  drawAnchoredAnnotations(
    ctx,
    project.annotations.map((a) =>
      a.imageId ? a : mapAnnotation(a, ratio, 0, 0)
    ),
    layout.placements.map((p) => ({
      ...p,
      x: p.x * ratio,
      y: p.y * ratio,
      width: p.width * ratio,
      height: p.height * ratio,
      scale: p.scale * ratio,
    }))
  );
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  let final = canvas;
  if (project.mockup.device !== 'none') {
    const size = mockupOutputSize(canvas.width, canvas.height, project.mockup);
    assertCanvasBudget(size.width, size.height);
    final = document.createElement('canvas');
    drawMockup(final, canvas, project.mockup);
  }
  drawWatermark(
    final,
    project.watermark,
    region
      ? {
          width: canvas.width,
          height: Math.floor(layout.height * ratio),
          y: offset,
        }
      : undefined
  );
  return final;
}

export function projectOutputSize(project: EditorProject) {
  const layout = getStitchedLayout(
    project.images,
    project.overlaps,
    project.gap,
    project.direction
  );
  const ratio = Math.min(
    1,
    (project.exportConfig.width || layout.width) / layout.width
  );
  return {
    width: Math.max(1, Math.floor(layout.width * ratio)),
    height: Math.max(1, Math.floor(layout.height * ratio)),
  };
}
export async function exportSource(project: EditorProject) {
  const size = projectOutputSize(project);
  if (
    (size.width * size.height <= MAX_RENDER_PIXELS &&
      Math.max(size.width, size.height) <= 30000) ||
    project.mockup.device !== 'none'
  ) {
    const canvas = await renderProject(project);
    return {
      width: canvas.width,
      height: canvas.height,
      tile: async (y: number, height: number) => {
        const tile = document.createElement('canvas');
        tile.width = canvas.width;
        tile.height = height;
        tile
          .getContext('2d')!
          .drawImage(
            canvas,
            0,
            y,
            canvas.width,
            height,
            0,
            0,
            canvas.width,
            height
          );
        return tile;
      },
    };
  }
  return {
    ...size,
    tile: (y: number, height: number) => renderProject(project, { y, height }),
  };
}

/** Bound preview memory independently from export resolution. */
export function previewScaleFor(width: number, height: number) {
  return Math.min(
    1,
    Math.sqrt(8_000_000 / Math.max(1, width * height)),
    8192 / Math.max(1, width, height)
  );
}
