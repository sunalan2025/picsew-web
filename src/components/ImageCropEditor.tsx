import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { StitchedImage } from '../types';
import { clampCropValue, getCropRect } from '../utils/imageState';

type Edge = 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight';
const fields: { edge: Edge; title: string; short: string }[] = [
  { edge: 'cropTop', title: '顶部', short: '上' },
  { edge: 'cropBottom', title: '底部', short: '下' },
  { edge: 'cropLeft', title: '左侧', short: '左' },
  { edge: 'cropRight', title: '右侧', short: '右' }
];

interface Props {
  images: StitchedImage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (index: number, edge: Edge, value: number) => void;
  onCommit: () => void;
  onReset: (index: number) => void;
}

/** Source image is never changed; the mask represents the same source rectangle
 * consumed by the stitched Canvas's drawImage(source, sx, sy, sw, sh, ...). */
export function ImageCropEditor({ images, selectedId, onSelect, onChange, onCommit, onReset }: Props) {
  const idx = Math.max(0, images.findIndex(img => img.id === selectedId));
  const image = images[idx];
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; edge: Edge; index: number;
    start: number; initial: number; sourcePerCssPx: number } | null>(null);
  if (!image) return <div className="p-6 text-sm text-slate-500">还没有可裁剪的截图。</div>;

  const rect = getCropRect(image);
  const fraction = { top: rect.top / image.height * 100, bottom: image.cropBottom / image.height * 100,
    left: rect.left / image.width * 100, right: image.cropRight / image.width * 100 };

  const begin = (event: React.PointerEvent<HTMLButtonElement>, edge: Edge) => {
    const dimensions = box.current?.getBoundingClientRect();
    if (!dimensions) return;
    event.stopPropagation(); event.preventDefault();
    const alongX = edge === 'cropLeft' || edge === 'cropRight';
    drag.current = { pointer: event.pointerId, edge, index: idx,
      start: alongX ? event.clientX : event.clientY, initial: image[edge],
      sourcePerCssPx: alongX ? image.width / dimensions.width : image.height / dimensions.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    const position = state.edge === 'cropLeft' || state.edge === 'cropRight'
      ? event.clientX : event.clientY;
    const sign = state.edge === 'cropRight' || state.edge === 'cropBottom' ? -1 : 1;
    onChange(state.index, state.edge,
      Math.round(state.initial + (position - state.start) * state.sourcePerCssPx * sign));
  };
  const end = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    drag.current = null;
    onCommit();
  };

  const prev = () => onSelect(images[(idx - 1 + images.length) % images.length].id);
  const next = () => onSelect(images[(idx + 1) % images.length].id);

  return <div className="crop-editor-ui flex min-h-0 flex-col gap-3 p-4 md:p-5">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <span className="crop-studio-eyebrow">SOURCE / 裁剪原图</span>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">选择保留的画面</h2>
        <p className="mt-1 text-xs text-slate-500">蓝框内将被保留，拖动四边手柄即刻生效。</p>
      </div>
      <button type="button" title="将当前图片还原为未裁剪" onClick={() => onReset(idx)}
        className="crop-soft-btn shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold">
        <RotateCcw className="h-3.5 w-3.5"/> 重置
      </button>
    </div>

    <div className="crop-thumbnails flex items-center gap-1.5">
      <button type="button" onClick={prev} aria-label="上一张截图"
        className="crop-small-step"><ChevronLeft className="h-4 w-4"/></button>
      <div className="min-w-0 flex flex-1 gap-2 overflow-x-auto py-1" aria-label="选择需要裁剪的截图">
        {images.map((item,n)=><button type="button" key={item.id}
          onClick={() => onSelect(item.id)} aria-pressed={idx === n}
          title={item.name}
          className={'crop-thumb shrink-0 ' + (idx === n ? 'active' : '')}>
          <img src={item.src} alt="" className="h-10 w-9 rounded object-contain"/>
          <span className="text-[11px] font-bold">{n+1}</span>
        </button>)}
      </div>
      <button type="button" onClick={next} aria-label="下一张截图"
        className="crop-small-step"><ChevronRight className="h-4 w-4"/></button>
    </div>

    <div className="crop-original-stage flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl p-3 md:p-5">
      <div className="relative shrink-0" ref={box}
        style={{ width: Math.min(520, 520 * image.width / image.height) + 'px',
          maxWidth: '100%', aspectRatio: image.width + ' / ' + image.height }}>
        <img src={image.src} alt={'正在裁剪的第 ' + (idx+1) + ' 张原图'}
          draggable={false} className="absolute inset-0 h-full w-full select-none"/>
        <div className="pointer-events-none absolute border-2 border-blue-500"
          style={{top: fraction.top + '%', bottom: fraction.bottom + '%',
            left: fraction.left + '%', right: fraction.right + '%',
            boxShadow:'0 0 0 1500px rgba(12,24,44,.53)'}}>
          <div className="absolute inset-0 crop-thirds-grid"/>
        </div>
        {fields.map(({edge,title}) => {
          const verticalEdge = edge === 'cropLeft' || edge === 'cropRight';
          const style: React.CSSProperties = verticalEdge
            ? {left: (edge === 'cropLeft' ? fraction.left : 100-fraction.right) + '%',
                top: (fraction.top+(100-fraction.top-fraction.bottom)/2) + '%'}
            : {top: (edge === 'cropTop' ? fraction.top : 100-fraction.bottom) + '%',
                left: (fraction.left+(100-fraction.left-fraction.right)/2) + '%'};
          return <button type="button" key={edge} title={'拖动裁剪' + title} aria-label={'拖动裁剪' + title}
            onPointerDown={e => begin(e,edge)} onPointerMove={move}
            onPointerUp={end} onPointerCancel={end}
            style={{...style, transform:'translate(-50%,-50%)',touchAction:'none'}}
            className={'crop-drag-handle ' + (verticalEdge ? 'vertical' : 'horizontal')}/>;
        })}
      </div>
    </div>

    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate text-slate-500" title={image.name}>第 {idx+1}/{images.length} 张 · {image.name}</span>
      <span className="crop-dimension shrink-0">{rect.width} × {rect.height} px</span>
    </div>

    <details className="crop-numeric-details rounded-xl border border-slate-200 bg-white" open={undefined}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-semibold text-slate-600">
        <span className="flex items-center gap-2"><SlidersHorizontal className="h-3.5 w-3.5"/> 精确裁剪</span>
        <span className="text-[11px] font-normal text-slate-400">四边独立 · px</span>
      </summary>
      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
        {fields.map(({edge,short})=>{
          const max = Math.max(0, (edge==='cropTop'||edge==='cropBottom'?image.height:image.width)
            - (edge==='cropTop'?image.cropBottom:edge==='cropBottom'?image.cropTop:
                edge==='cropLeft'?image.cropRight:image.cropLeft) - 10);
          return <label key={edge} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs">
            <span className="text-slate-500">{short}</span>
            <input type="number" min={0} max={max} step={1} value={image[edge]}
              aria-label={short + '侧裁剪像素'}
              onChange={e => onChange(idx,edge,clampCropValue(image,edge,Number(e.target.value)))}
              onBlur={onCommit}
              className="w-[75px] min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-right font-mono font-semibold text-slate-700"/>
          </label>;
        })}
      </div>
    </details>
  </div>;
}
