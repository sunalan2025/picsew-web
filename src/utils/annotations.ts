import type { Annotation } from '../types';
export const drawArrow = (
  ctx: CanvasRenderingContext2D,
  fromx: number,
  fromy: number,
  tox: number,
  toy: number,
  width: number
) => {
  const headlen = width * 3.5;
  const dx = tox - fromx;
  const dy = toy - fromy;
  const angle = Math.atan2(dy, dx);

  ctx.beginPath();
  ctx.moveTo(fromx, fromy);
  ctx.lineTo(tox, toy);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tox, toy);
  ctx.lineTo(
    tox - headlen * Math.cos(angle - Math.PI / 6),
    toy - headlen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    tox - headlen * Math.cos(angle + Math.PI / 6),
    toy - headlen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
};

let tempBlurCanvas: HTMLCanvasElement | null = null;
let pixelBlurCanvas: HTMLCanvasElement | null = null;

export const drawSingleAnnotation = (
  ctx: CanvasRenderingContext2D,
  anno: Annotation
) => {
  ctx.save();
  ctx.strokeStyle = anno.color;
  ctx.fillStyle = anno.color;
  ctx.lineWidth = anno.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (anno.type) {
    case 'pen':
      if (anno.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(anno.points[0].x, anno.points[0].y);
        for (let p of anno.points) {
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      break;

    case 'arrow':
      drawArrow(
        ctx,
        anno.startX,
        anno.startY,
        anno.endX,
        anno.endY,
        anno.strokeWidth
      );
      break;

    case 'rect':
      ctx.strokeRect(anno.x, anno.y, anno.width, anno.height);
      break;

    case 'text':
      ctx.font = `${anno.fontSize}px -apple-system, sans-serif`;
      ctx.textBaseline = 'top';
      if (anno.color === '#ffffff') {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
      }
      ctx.fillText(anno.text, anno.x, anno.y);
      break;

    case 'blur':
      const x = Math.min(anno.x, anno.x + anno.width);
      const y = Math.min(anno.y, anno.y + anno.height);
      const w = Math.abs(anno.width);
      const h = Math.abs(anno.height);

      if (w > 4 && h > 4) {
        try {
          if (!tempBlurCanvas)
            tempBlurCanvas = document.createElement('canvas');
          if (!pixelBlurCanvas)
            pixelBlurCanvas = document.createElement('canvas');

          const tempCtx = tempBlurCanvas.getContext('2d', {
            willReadFrequently: true,
          });
          if (tempCtx) {
            let resized = false;
            if (tempBlurCanvas.width !== w) {
              tempBlurCanvas.width = w;
              resized = true;
            }
            if (tempBlurCanvas.height !== h) {
              tempBlurCanvas.height = h;
              resized = true;
            }
            if (!resized) tempCtx.clearRect(0, 0, w, h);

            // Draw from main canvas to temp canvas to avoid expensive getImageData readback
            const transform = ctx.getTransform();
            tempCtx.drawImage(
              ctx.canvas,
              x + transform.e,
              y + transform.f,
              w,
              h,
              0,
              0,
              w,
              h
            );

            ctx.save();
            if (anno.blurType === 'pixel') {
              const scale = 0.08;
              const sw = Math.max(1, Math.round(w * scale));
              const sh = Math.max(1, Math.round(h * scale));

              const pixelCtx = pixelBlurCanvas.getContext('2d', {
                willReadFrequently: true,
              });
              if (pixelCtx) {
                let pResized = false;
                if (pixelBlurCanvas.width !== sw) {
                  pixelBlurCanvas.width = sw;
                  pResized = true;
                }
                if (pixelBlurCanvas.height !== sh) {
                  pixelBlurCanvas.height = sh;
                  pResized = true;
                }
                if (!pResized) pixelCtx.clearRect(0, 0, sw, sh);

                pixelCtx.imageSmoothingEnabled = false;
                pixelCtx.drawImage(tempBlurCanvas, 0, 0, sw, sh);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(pixelBlurCanvas, 0, 0, sw, sh, x, y, w, h);
              }
            } else {
              ctx.filter = 'blur(12px)';
              ctx.drawImage(tempBlurCanvas, x, y, w, h);
            }
            ctx.restore();
          }
        } catch (e) {
          console.error('Error drawing blur annotation', e);
        }
      }
      break;
  }
  ctx.restore();
};

import type { ImagePlacement } from './imageState';

/** Convert geometry between source and output pixels without changing its shape. */
export function mapAnnotation(
  anno: Annotation,
  scale: number,
  dx: number,
  dy: number
): Annotation {
  const base = { ...anno, strokeWidth: anno.strokeWidth * scale };
  switch (anno.type) {
    case 'pen':
      return {
        ...base,
        type: 'pen',
        points: anno.points.map((p) => ({
          x: p.x * scale + dx,
          y: p.y * scale + dy,
        })),
      };
    case 'arrow':
      return {
        ...base,
        type: 'arrow',
        startX: anno.startX * scale + dx,
        startY: anno.startY * scale + dy,
        endX: anno.endX * scale + dx,
        endY: anno.endY * scale + dy,
      };
    case 'text':
      return {
        ...base,
        type: 'text',
        x: anno.x * scale + dx,
        y: anno.y * scale + dy,
        text: anno.text,
        fontSize: anno.fontSize * scale,
      };
    case 'rect':
      return {
        ...base,
        type: 'rect',
        x: anno.x * scale + dx,
        y: anno.y * scale + dy,
        width: anno.width * scale,
        height: anno.height * scale,
      };
    case 'blur':
      return {
        ...base,
        type: 'blur',
        x: anno.x * scale + dx,
        y: anno.y * scale + dy,
        width: anno.width * scale,
        height: anno.height * scale,
        blurType: anno.blurType,
      };
  }
}
export function annotationBounds(anno: Annotation) {
  const points =
    anno.type === 'pen'
      ? anno.points
      : anno.type === 'arrow'
        ? [
            { x: anno.startX, y: anno.startY },
            { x: anno.endX, y: anno.endY },
          ]
        : [
            { x: anno.x, y: anno.y },
            {
              x:
                anno.x +
                (anno.type === 'text'
                  ? anno.text.length * anno.fontSize
                  : anno.width),
              y: anno.y + (anno.type === 'text' ? anno.fontSize : anno.height),
            },
          ];
  return {
    left: Math.min(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    right: Math.max(...points.map((p) => p.x)),
    bottom: Math.max(...points.map((p) => p.y)),
  };
}
export function anchorAnnotation(
  anno: Annotation,
  placements: ImagePlacement[]
): Annotation[] {
  const bounds = annotationBounds(anno);
  const seen = new Set<string>();
  return placements
    .filter((p) => {
      const id = p.image.originalId ?? p.image.id;
      if (
        seen.has(id) ||
        bounds.right < p.x ||
        bounds.left > p.x + p.width ||
        bounds.bottom < p.y ||
        bounds.top > p.y + p.height
      )
        return false;
      seen.add(id);
      return true;
    })
    .map((p) => ({
      ...mapAnnotation(
        anno,
        1 / p.scale,
        p.crop.left - p.x / p.scale,
        p.crop.top - p.y / p.scale
      ),
      id: crypto.randomUUID(),
      imageId: p.image.originalId ?? p.image.id,
    }));
}
export function drawAnchoredAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  placements: ImagePlacement[]
) {
  for (const anno of annotations) {
    if (!anno.imageId) {
      drawSingleAnnotation(ctx, anno);
      continue;
    }
    for (const pos of placements.filter(
      (p) => (p.image.originalId ?? p.image.id) === anno.imageId
    )) {
      // Clip at the next image's visible top edge as well as the source crop.
      const next = placements[pos.index + 1];
      const horizontal = next && next.x > pos.x;
      const width = horizontal
        ? Math.min(pos.width, next.x - pos.x)
        : pos.width;
      const height =
        next && !horizontal ? Math.min(pos.height, next.y - pos.y) : pos.height;
      ctx.save();
      ctx.beginPath();
      ctx.rect(pos.x, pos.y, width, height);
      ctx.clip();
      drawSingleAnnotation(
        ctx,
        mapAnnotation(
          anno,
          pos.scale,
          pos.x - pos.crop.left * pos.scale,
          pos.y - pos.crop.top * pos.scale
        )
      );
      ctx.restore();
    }
  }
}
