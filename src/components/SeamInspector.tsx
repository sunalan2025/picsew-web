import { useEffect, useRef, useState } from 'react';
import type { StitchedImage } from '../types';
import { getStitchedLayout } from '../utils/imageState';
import { loadImage } from '../utils/stitching';
interface Props {
  images: StitchedImage[];
  overlaps: number[];
  direction: 'vertical' | 'horizontal';
  gap: number;
  index: number;
  max: number;
  onChange: (value: number) => void;
  onCommit: () => void;
  onRematch?: () => void;
  onAccept?: () => void;
}
export function SeamInspector({
  images,
  overlaps,
  direction,
  gap,
  index,
  max,
  onChange,
  onCommit,
  onRematch,
  onAccept,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [opacity, setOpacity] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const value = overlaps[index] || 0;
  useEffect(() => {
    let cancelled = false;
    const layout = getStitchedLayout(images, overlaps, gap, direction);
    const previous = layout.placements[index],
      next = layout.placements[index + 1];
    if (!previous || !next) return;
    Promise.all([loadImage(previous.image.src), loadImage(next.image.src)])
      .then((sources) => {
        if (cancelled || !canvas.current) return;
        const ctx = canvas.current.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, 320, 200);
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, 320, 200);
        ctx.save();
        ctx.translate(160, 100);
        ctx.scale(zoom, zoom);
        ctx.translate(
          -(direction === 'vertical' ? layout.width / 2 : next.x),
          -(direction === 'vertical' ? next.y : layout.height / 2)
        );
        [previous, next].forEach((p, i) => {
          ctx.globalAlpha = i ? opacity : 1;
          ctx.drawImage(
            sources[i],
            p.crop.left,
            p.crop.top,
            p.crop.width,
            p.crop.height,
            p.x,
            p.y,
            p.width,
            p.height
          );
        });
        ctx.restore();
        ctx.strokeStyle = '#f97316';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        if (direction === 'vertical') {
          ctx.moveTo(0, 100);
          ctx.lineTo(320, 100);
        } else {
          ctx.moveTo(160, 0);
          ctx.lineTo(160, 200);
        }
        ctx.stroke();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [images, overlaps, direction, gap, index, opacity, zoom]);
  const change = (next: number) => {
    onChange(Math.max(0, Math.min(max, Math.round(next))));
  };
  const step = (delta: number) => {
    change(value + delta);
    onCommit();
  };
  return (
    <div className="space-y-2" aria-label={`接缝 ${index + 1} 放大精调`}>
      <p className="text-xs text-slate-600">
        先看文字是否重复、缺失或错位，正常就点下面的确认按钮。
      </p>
      <button
        type="button"
        onClick={onAccept}
        className="w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
      >
        这处看起来没问题
      </button>
      <p className="text-xs text-slate-500">
        两图叠加检查重影；方向键微调 1 px，Shift 微调 10 px。
      </p>
      <canvas
        ref={canvas}
        width={320}
        height={200}
        tabIndex={0}
        aria-label="接缝叠加放大图"
        className="w-full rounded-lg border focus:ring-2 focus:ring-blue-500"
        onKeyDown={(event) => {
          if (
            ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(
              event.key
            )
          ) {
            event.preventDefault();
            step(
              (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? 1 : -1) *
                (event.shiftKey ? 10 : 1)
            );
          }
        }}
      />
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          className="rounded border px-2 py-2 text-xs"
          onClick={() => step(-10)}
        >
          −10
        </button>
        <button
          type="button"
          className="rounded border px-2 py-2 text-xs"
          aria-label="减少重合 1 像素"
          onClick={() => step(-1)}
        >
          −1
        </button>
        <input
          type="number"
          aria-label={`接缝 ${index + 1} 原图重合像素`}
          min={0}
          max={max}
          value={value}
          onChange={(e) => change(Number(e.target.value))}
          onBlur={onCommit}
          className="min-w-0 w-20 text-center"
        />
        <button
          type="button"
          className="rounded border px-2 py-2 text-xs"
          aria-label="增加重合 1 像素"
          onClick={() => step(1)}
        >
          +1
        </button>
        <button
          type="button"
          className="rounded border px-2 py-2 text-xs"
          onClick={() => step(10)}
        >
          +10
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs">
        叠加透明度
        <input
          type="range"
          aria-label="接缝叠加透明度"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
        />
      </label>
      <div className="flex items-center justify-between text-xs">
        <label>
          放大{' '}
          <select
            aria-label="接缝放大倍数"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[1, 2, 4].map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onRematch}
          className="rounded bg-blue-50 px-2 py-2 text-blue-700"
        >
          只重新匹配这处
        </button>
      </div>
    </div>
  );
}
