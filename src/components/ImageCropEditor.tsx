import React, { useRef, useState } from 'react';
import type { StitchedImage } from '../types';
import { clampCropValue } from '../utils/imageState';

type Edge = 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight';
const edges: {key: Edge; label: string}[] = [
  {key:'cropTop',label:'上边'}, {key:'cropBottom',label:'下边'},
  {key:'cropLeft',label:'左边'}, {key:'cropRight',label:'右边'}
];
interface Props {
  images: StitchedImage[];
  onChange: (index: number, edge: Edge, value: number) => void;
  onCommit: () => void;
  onReset: (index: number) => void;
}

/** Independent image cropping with draggable borders and exact numeric controls. */
export function ImageCropEditor({images, onChange, onCommit, onReset}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const index = Math.max(0, images.findIndex(image => image.id === selected));
  const image = images[index];
  const preview = useRef<HTMLDivElement>(null);
  const gesture = useRef<{id:number; index:number; edge:Edge; start:number; value:number; ratio:number} | null>(null);
  if (!image) return <p className="text-sm text-slate-500">先导入图片，再进行裁剪。</p>;

  const pct = {
    top: image.cropTop / image.height * 100,
    bottom: image.cropBottom / image.height * 100,
    left: image.cropLeft / image.width * 100,
    right: image.cropRight / image.width * 100
  };
  const begin = (e: React.PointerEvent<HTMLButtonElement>, edge:Edge) => {
    const box=preview.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const x=edge==='cropLeft'||edge==='cropRight';
    gesture.current={id:e.pointerId,index,edge,start:x?e.clientX:e.clientY,
      value:image[edge],ratio:x?image.width/box.width:image.height/box.height};
  };
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g=gesture.current;
    if (!g || g.id!==e.pointerId) return;
    const pos=g.edge==='cropLeft'||g.edge==='cropRight'?e.clientX:e.clientY;
    const sign=g.edge==='cropRight'||g.edge==='cropBottom'?-1:1;
    onChange(g.index,g.edge,Math.round(g.value+(pos-g.start)*g.ratio*sign));
  };
  const end = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.id!==e.pointerId) return;
    gesture.current=null;
    onCommit();
  };

  return <section className="space-y-3" aria-label="四边自由裁剪">
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold text-slate-900">四边自由裁剪</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">选一张图片，拖动蓝色控制点裁剪任意一边。</p>
      </div>
      <button type="button" onClick={()=>onReset(index)}
        className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-600">
        重置本张
      </button>
    </div>

    <div className="flex gap-2 overflow-x-auto pb-2" aria-label="选择图片">
      {images.map((item,n)=><button key={item.id} type="button"
        onClick={()=>setSelected(item.id)} aria-pressed={index===n}
        className={`shrink-0 w-16 rounded-xl border-2 p-1.5 text-center
          ${n===index?'border-blue-600 bg-blue-50':'border-slate-200 bg-white'}`}>
        <img src={item.src} alt="" className="mx-auto h-14 w-11 object-contain"/>
        <span className="block text-xs font-semibold text-slate-700">{n+1}</span>
      </button>)}
    </div>

    <p className="truncate text-xs text-slate-500">第 {index+1} 张 · {image.name}</p>
    <div className="rounded-2xl bg-slate-100 p-4 border border-slate-200">
      <div ref={preview} className="relative mx-auto overflow-hidden bg-white shadow-md"
        style={{width:`${Math.min(220,285*image.width/image.height)}px`,maxWidth:'100%',aspectRatio:`${image.width}/${image.height}`}}>
        <img src={image.src} alt="当前图片四边裁剪预览"
          className="absolute inset-0 h-full w-full" draggable={false}/>
        <div className="pointer-events-none absolute border-2 border-blue-500"
          style={{top:`${pct.top}%`,bottom:`${pct.bottom}%`,
            left:`${pct.left}%`,right:`${pct.right}%`,
            boxShadow:'0 0 0 1000px rgba(15,23,42,.48)'}}/>
        {edges.map(({key,label})=>{
          const lr=key==='cropLeft'||key==='cropRight';
          const style:React.CSSProperties=lr?{
            left:`${key==='cropLeft'?pct.left:100-pct.right}%`,
            top:`${(pct.top+100-pct.bottom)/2}%`
          }:{
            left:`${(pct.left+100-pct.right)/2}%`,
            top:`${key==='cropTop'?pct.top:100-pct.bottom}%`
          };
          return <button key={key} type="button" aria-label={`拖动${label}裁剪线`}
            onPointerDown={e=>begin(e,key)} onPointerMove={move}
            onPointerUp={end} onPointerCancel={end}
            style={{...style,transform:'translate(-50%,-50%)',touchAction:'none'}}
            className={`absolute z-10 cursor-grab rounded-full border-[3px] border-white bg-blue-500
              shadow-md active:cursor-grabbing ${lr?'h-10 w-5':'w-10 h-5'}`}/>;
        })}
      </div>
      <p className="mt-3 text-center text-xs text-slate-600">
        保留区域 <strong className="text-blue-700">
          {image.width-image.cropLeft-image.cropRight} × {image.height-image.cropTop-image.cropBottom} px
        </strong>
      </p>
    </div>

    <div className="space-y-2">
      {edges.map(({key,label})=>{
        const horizontal=key==='cropLeft'||key==='cropRight';
        const other=key==='cropLeft'?image.cropRight:key==='cropRight'?image.cropLeft:
          key==='cropTop'?image.cropBottom:image.cropTop;
        const max=Math.max(0,(horizontal?image.width:image.height)-other-10);
        return <div key={key} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label htmlFor={`crop-slider-${key}`} className="text-xs font-semibold text-slate-700">
              {label}
            </label>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <input type="number" min={0} max={max} step={1} value={image[key]}
                aria-label={`${label}裁剪像素`}
                onChange={e=>onChange(index,key,clampCropValue(image,key,Number(e.target.value)))}
                onBlur={onCommit}
                className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right font-mono text-blue-700"/>
              px
            </span>
          </div>
          <input id={`crop-slider-${key}`} type="range" min={0} max={max}
            value={image[key]} onChange={e=>onChange(index,key,Number(e.target.value))}
            onPointerUp={onCommit} onKeyUp={onCommit} className="w-full accent-blue-600"/>
        </div>;
      })}
    </div>
    <p className="text-xs leading-5 text-slate-500">每张图都能独立裁上下左右四边；调整后可点击“重新智能对齐”。</p>
  </section>;
}
