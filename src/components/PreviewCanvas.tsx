import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, Undo2, RotateCcw
} from 'lucide-react';
import type {
  StitchedImage,
  Annotation,
  AnnotationType,
  StatusBarConfig,
  MockupConfig
} from '../types';
import { drawStatusBar } from '../utils/statusBar';
import { drawMockup } from '../utils/mockup';

interface PreviewCanvasProps {
  images: StitchedImage[];
  direction: 'vertical' | 'horizontal';
  gap: number;
  overlaps: number[];
  statusBar: StatusBarConfig;
  mockup: MockupConfig;
  annotations: Annotation[];
  onAddAnnotation: (anno: Annotation) => void;
  selectedTool: AnnotationType | 'select' | 'cut-horizontal' | 'cut-vertical';
  activeTab: string;
  color: string;
  strokeWidth: number;
  fontSize: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Callback adjustments
  onAdjustOverlap: (idx: number, val: number) => void;
  onAdjustCrop: (sliceIndex: number, field: 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight', val: number) => void;
  onSplitImage: (sliceIndex: number, relativeCoord: number, scale: number, type: 'horizontal' | 'vertical') => void;
  onDragEnd: () => void;
  
  onUndo: () => void;
  canUndo: boolean;
  onResetAll: () => void;
}

const drawArrow = (
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
  ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
};

let tempBlurCanvas: HTMLCanvasElement | null = null;
let pixelBlurCanvas: HTMLCanvasElement | null = null;

const drawSingleAnnotation = (ctx: CanvasRenderingContext2D, anno: Annotation) => {
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
      drawArrow(ctx, anno.startX, anno.startY, anno.endX, anno.endY, anno.strokeWidth);
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
          if (!tempBlurCanvas) tempBlurCanvas = document.createElement('canvas');
          if (!pixelBlurCanvas) pixelBlurCanvas = document.createElement('canvas');

          const tempCtx = tempBlurCanvas.getContext('2d', { willReadFrequently: true });
          if (tempCtx) {
            let resized = false;
            if (tempBlurCanvas.width !== w) { tempBlurCanvas.width = w; resized = true; }
            if (tempBlurCanvas.height !== h) { tempBlurCanvas.height = h; resized = true; }
            if (!resized) tempCtx.clearRect(0, 0, w, h);

            // Draw from main canvas to temp canvas to avoid expensive getImageData readback
            tempCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);

            ctx.save();
            if (anno.blurType === 'pixel') {
              const scale = 0.08;
              const sw = Math.max(1, Math.round(w * scale));
              const sh = Math.max(1, Math.round(h * scale));
              
              const pixelCtx = pixelBlurCanvas.getContext('2d', { willReadFrequently: true });
              if (pixelCtx) {
                let pResized = false;
                if (pixelBlurCanvas.width !== sw) { pixelBlurCanvas.width = sw; pResized = true; }
                if (pixelBlurCanvas.height !== sh) { pixelBlurCanvas.height = sh; pResized = true; }
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

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  images,
  direction,
  gap,
  overlaps,
  statusBar,
  mockup,
  annotations,
  onAddAnnotation,
  selectedTool,
  activeTab,
  color,
  strokeWidth,
  fontSize,
  canvasRef,
  onAdjustOverlap,
  onAdjustCrop,
  onSplitImage,
  onDragEnd,
  onUndo,
  canUndo,
  onResetAll
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Zoom State
  const [zoom, setZoom] = useState<number>(1.0);

  // Drawing & Dragging Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[]>([]);
  const [textInput, setTextInput] = useState<{ x: number; y: number; val: string } | null>(null);

  // Dragging alignment/crop state (using screen pixels to prevent canvas resize feedback loops)
  const [dragMode, setDragMode] = useState<'none' | 'overlap' | 'crop'>('none');
  const [draggedSliceIdx, setDraggedSliceIdx] = useState<number>(-1);
  const [draggedField, setDraggedField] = useState<'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight' | 'none'>('none');
  const [initialVal, setInitialVal] = useState<number>(0);
  const [dragStartScreen, setDragStartScreen] = useState<{ x: number; y: number } | null>(null);
  
  // Hover guides for split line placement
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Image preloading cache (prevents browser decoding on every mousemove, unlocking 60fps drag performance)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderPipelineRef = useRef<(() => void) | null>(null);

  // Performance optimization: Cache the stitched background layer
  // Avoids 60fps full redraws when dragging annotations or splitting images
  const stitchedCacheCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastStitchDepsRef = useRef<string>('');

  // --- Zoom Controllers ---
  const handleZoomIn = () => setZoom(z => Math.min(3.0, z + 0.1));
  const handleZoomOut = () => setZoom(z => Math.max(0.1, z - 0.1));
  
  const handleFitWidth = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const containerW = container.clientWidth - 48;
    const targetW = canvas.width;

    if (targetW > 0) {
      setZoom(Math.max(0.05, Math.min(3.0, containerW / targetW)));
    }
  }, [canvasRef]);

  const handleFitHeight = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const containerH = container.clientHeight - 110;
    const targetH = canvas.height;

    if (targetH > 0) {
      setZoom(Math.max(0.05, Math.min(3.0, containerH / targetH)));
    }
  }, [canvasRef]);

  const handleResetZoom = () => setZoom(1.0);

  // Auto fit on load/resize
  useEffect(() => {
    if (images.length > 0) {
      const timer = setTimeout(() => {
        if (direction === 'vertical') {
          handleFitWidth();
        } else {
          handleFitHeight();
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [images.length, direction, handleFitWidth, handleFitHeight]);

  // Core Render Loop: Builds the stitched image + statusbar + crops
  const renderStitchedImage = useCallback((): HTMLCanvasElement => {
    const baseCanvas = baseCanvasRef.current || document.createElement('canvas');
    baseCanvasRef.current = baseCanvas;

    const ctx = baseCanvas.getContext('2d');
    if (!ctx || images.length === 0) return baseCanvas;

    const currentDeps = [
      images.map(img => `${img.id}-${img.cropTop}-${img.cropBottom}-${img.cropLeft}-${img.cropRight}`).join(','),
      direction,
      gap,
      overlaps.join(','),
      `${statusBar.enabled}-${statusBar.time}-${statusBar.battery}-${statusBar.wifi}-${statusBar.style}`
    ].join('|');

    let allLoaded = true;
    for (const img of images) {
      if (!imageCacheRef.current.get(img.id)?.complete) {
        allLoaded = false;
      }
    }

    if (stitchedCacheCanvasRef.current && lastStitchDepsRef.current === currentDeps && allLoaded) {
      const cache = stitchedCacheCanvasRef.current;
      let bResized = false;
      if (baseCanvas.width !== cache.width) { baseCanvas.width = cache.width; bResized = true; }
      if (baseCanvas.height !== cache.height) { baseCanvas.height = cache.height; bResized = true; }
      if (!bResized) ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      ctx.drawImage(cache, 0, 0);
      return baseCanvas;
    }

    // Normalize all images to the visible width of the first image
    const firstVisibleW = images[0].width - images[0].cropLeft - images[0].cropRight;
    const baseW = Math.max(50, firstVisibleW);

    // Calculate dimensions
    let totalW = baseW;
    let totalH = 0;

    const imgPositions: { y: number; x: number; w: number; h: number; imgEl: HTMLImageElement; cropL: number; cropT: number; cropR: number; cropB: number; visibleW: number; visibleH: number }[] = [];

    // Pre-calculate heights & positions for all images
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      
      const cropL = img.cropLeft;
      const cropR = img.cropRight;
      const cropT = img.cropTop;
      const cropB = img.cropBottom;

      const visibleW = img.width - cropL - cropR;
      const visibleH = img.height - cropT - cropB;

      if (direction === 'vertical') {
        const scale = baseW / Math.max(10, visibleW);
        const w = baseW;
        const h = visibleH * scale;

        // Fetch image from cache instead of recreating
        let imgEl = imageCacheRef.current.get(img.id);
        if (!imgEl) {
          imgEl = new Image();
          imgEl.src = img.src;
          imgEl.onload = () => renderPipelineRef.current?.();
          imageCacheRef.current.set(img.id, imgEl);
        }

        let yPos = totalH;
        if (i > 0) {
          const overlap = (overlaps[i - 1] || 0) * scale;
          yPos = totalH - overlap + gap;
        }
        imgPositions.push({ y: yPos, x: 0, w, h, imgEl, cropL, cropT, cropR, cropB, visibleW, visibleH });
        totalH = yPos + h;
      } else {
        // Horizontal stitching: Height is normalized to baseW
        const scale = baseW / Math.max(10, visibleH);
        const h = baseW;
        const w = visibleW * scale;

        let imgEl = imageCacheRef.current.get(img.id);
        if (!imgEl) {
          imgEl = new Image();
          imgEl.src = img.src;
          imgEl.onload = () => renderPipelineRef.current?.();
          imageCacheRef.current.set(img.id, imgEl);
        }

        let xPos = totalH; // using totalH as accumulator
        if (i > 0) {
          const overlap = (overlaps[i - 1] || 0) * scale;
          xPos = totalH - overlap + gap;
        }
        imgPositions.push({ y: 0, x: xPos, w, h, imgEl, cropL, cropT, cropR, cropB, visibleW, visibleH });
        totalH = xPos + w;
      }
    }

    const targetW = direction === 'vertical' ? totalW : totalH;
    const targetH = direction === 'vertical' ? totalH : baseW;

    const cacheCanvas = stitchedCacheCanvasRef.current || document.createElement('canvas');
    stitchedCacheCanvasRef.current = cacheCanvas;
    if (cacheCanvas.width !== targetW) cacheCanvas.width = targetW;
    if (cacheCanvas.height !== targetH) cacheCanvas.height = targetH;

    const cacheCtx = cacheCanvas.getContext('2d');
    if (!cacheCtx) return baseCanvas;

    // Clean canvas
    cacheCtx.fillStyle = '#0f0f12';
    cacheCtx.fillRect(0, 0, cacheCanvas.width, cacheCanvas.height);

    // Draw images
    imgPositions.forEach((pos) => {
      if (pos.imgEl.complete) {
        cacheCtx.drawImage(
          pos.imgEl,
          pos.cropL, pos.cropT, pos.visibleW, pos.visibleH,
          pos.x, pos.y, pos.w, pos.h
        );
      }
    });

    // Overlay Status Bar (Vertical only)
    if (statusBar.enabled && direction === 'vertical') {
      const sbHeight = Math.round(cacheCanvas.width * 0.05);
      drawStatusBar(cacheCtx, cacheCanvas.width, sbHeight, statusBar);
    }

    if (allLoaded) {
      lastStitchDepsRef.current = currentDeps;
    }

    let bcResized = false;
    if (baseCanvas.width !== cacheCanvas.width) { baseCanvas.width = cacheCanvas.width; bcResized = true; }
    if (baseCanvas.height !== cacheCanvas.height) { baseCanvas.height = cacheCanvas.height; bcResized = true; }
    if (!bcResized) ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    ctx.drawImage(cacheCanvas, 0, 0);

    return baseCanvas;
  }, [images, direction, overlaps, gap, statusBar]);



  // Main Pipeline: Composes base stitched image + mockup wrap + annotations
  const renderPipeline = useCallback(() => {
    if (images.length === 0 || !canvasRef.current) return;

    // Step A: Stitch images + Status bar + Crops
    const baseStitchedCanvas = renderStitchedImage();

    // Step B: Render annotations
    const baseCtx = baseStitchedCanvas.getContext('2d');
    if (baseCtx) {
      annotations.forEach((anno) => {
        drawSingleAnnotation(baseCtx, anno);
      });

      // Render active pen/arrow/shape drawing
      if (isDrawing && startPoint && currentPoint && selectedTool !== 'cut-horizontal' && selectedTool !== 'cut-vertical' && dragMode === 'none') {
        baseCtx.save();
        baseCtx.strokeStyle = color;
        baseCtx.fillStyle = color;
        baseCtx.lineWidth = strokeWidth;
        baseCtx.lineCap = 'round';
        baseCtx.lineJoin = 'round';

        if (selectedTool === 'pen' && penPoints.length > 1) {
          baseCtx.beginPath();
          baseCtx.moveTo(penPoints[0].x, penPoints[0].y);
          for (let p of penPoints) {
            baseCtx.lineTo(p.x, p.y);
          }
          baseCtx.stroke();
        } else if (selectedTool === 'arrow') {
          drawArrow(baseCtx, startPoint.x, startPoint.y, currentPoint.x, currentPoint.y, strokeWidth);
        } else if (selectedTool === 'rect') {
          baseCtx.strokeRect(startPoint.x, startPoint.y, currentPoint.x - startPoint.x, currentPoint.y - startPoint.y);
        } else if (selectedTool === 'blur') {
          baseCtx.strokeStyle = '#c084fc';
          baseCtx.lineWidth = 2;
          baseCtx.setLineDash([6, 4]);
          baseCtx.strokeRect(startPoint.x, startPoint.y, currentPoint.x - startPoint.x, currentPoint.y - startPoint.y);
        }
        baseCtx.restore();
      }

      // Render Cut seams / Split lines clearly when in Cut tab
      if (activeTab === 'cut') {
        baseCtx.save();
        baseCtx.strokeStyle = '#f43f5e'; // Rose color for seams
        baseCtx.lineWidth = 2;
        baseCtx.setLineDash([6, 3]);

        const firstVisibleW = images[0].width - images[0].cropLeft - images[0].cropRight;
        const baseW = Math.max(50, firstVisibleW);
        let currentY = 0;
        let currentX = 0;

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const visibleW = img.width - img.cropLeft - img.cropRight;
          const visibleH = img.height - img.cropTop - img.cropBottom;

          if (direction === 'vertical') {
            const scale = baseW / Math.max(10, visibleW);
            const h = visibleH * scale;
            let overlap = i > 0 ? (overlaps[i - 1] || 0) * scale : 0;
            const adjustedStartY = currentY - overlap;

            if (i > 0) {
              // Draw horizontal seam
              baseCtx.beginPath();
              baseCtx.moveTo(0, adjustedStartY);
              baseCtx.lineTo(baseStitchedCanvas.width, adjustedStartY);
              baseCtx.stroke();

              // Draw a small scissors icon/label
              baseCtx.fillStyle = '#f43f5e';
              baseCtx.font = 'bold 10px sans-serif';
              baseCtx.textBaseline = 'bottom';
              baseCtx.fillText(` ✂️ 分割线 ${i}`, 10, adjustedStartY - 3);
            }
            currentY = adjustedStartY + h + gap;
          } else {
            const scale = baseW / Math.max(10, visibleH);
            const w = visibleW * scale;
            let overlap = i > 0 ? (overlaps[i - 1] || 0) * scale : 0;
            const adjustedStartX = currentX - overlap;

            if (i > 0) {
              // Draw vertical seam
              baseCtx.beginPath();
              baseCtx.moveTo(adjustedStartX, 0);
              baseCtx.lineTo(adjustedStartX, baseStitchedCanvas.height);
              baseCtx.stroke();

              // Draw label
              baseCtx.fillStyle = '#f43f5e';
              baseCtx.font = 'bold 10px sans-serif';
              baseCtx.textBaseline = 'bottom';
              baseCtx.fillText(` ✂️ 分割线 ${i}`, adjustedStartX + 4, 18);
            }
            currentX = adjustedStartX + w + gap;
          }
        }
        baseCtx.restore();
      }

      // Render active placement hover guide line
      if (activeTab === 'cut' && selectedTool === 'cut-horizontal' && hoverY !== null && !isDrawing) {
        baseCtx.save();
        baseCtx.strokeStyle = '#f43f5e';
        baseCtx.lineWidth = 3;
        baseCtx.setLineDash([8, 4]);
        baseCtx.beginPath();
        baseCtx.moveTo(0, hoverY);
        baseCtx.lineTo(baseStitchedCanvas.width, hoverY);
        
        baseCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        baseCtx.shadowBlur = 4;
        baseCtx.stroke();

        baseCtx.fillStyle = '#f43f5e';
        baseCtx.font = 'semibold 12px sans-serif';
        baseCtx.textBaseline = 'bottom';
        baseCtx.fillText(' ✂️ 点击切分图片 (水平线)', 10, hoverY - 4);
        baseCtx.restore();
      }

      if (activeTab === 'cut' && selectedTool === 'cut-vertical' && hoverX !== null && !isDrawing) {
        baseCtx.save();
        baseCtx.strokeStyle = '#3b82f6'; // Blue vertical line
        baseCtx.lineWidth = 3;
        baseCtx.setLineDash([8, 4]);
        baseCtx.beginPath();
        baseCtx.moveTo(hoverX, 0);
        baseCtx.lineTo(hoverX, baseStitchedCanvas.height);
        
        baseCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        baseCtx.shadowBlur = 4;
        baseCtx.stroke();

        baseCtx.fillStyle = '#3b82f6';
        baseCtx.font = 'semibold 12px sans-serif';
        baseCtx.textBaseline = 'bottom';
        baseCtx.fillText(' ✂️ 点击切分图片 (垂直线)', hoverX + 4, 20);
        baseCtx.restore();
      }
    }

    // Step C: Apply Mockup wrapper (only if mockup is enabled and not editing cuts/markup)
    const isEditingMode = activeTab === 'markup' || activeTab === 'cut';
    const shouldShowMockup = mockup.device !== 'none' && !isEditingMode;

    if (shouldShowMockup) {
      drawMockup(canvasRef.current, baseStitchedCanvas, mockup);
    } else {
      let resized = false;
      if (canvasRef.current.width !== baseStitchedCanvas.width) {
        canvasRef.current.width = baseStitchedCanvas.width;
        resized = true;
      }
      if (canvasRef.current.height !== baseStitchedCanvas.height) {
        canvasRef.current.height = baseStitchedCanvas.height;
        resized = true;
      }
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        if (!resized) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        ctx.drawImage(baseStitchedCanvas, 0, 0);
      }
    }
  }, [
    images, direction, gap, overlaps, mockup, annotations,
    isDrawing, startPoint, currentPoint, selectedTool, dragMode, color, strokeWidth, penPoints,
    activeTab, hoverY, hoverX, canvasRef, renderStitchedImage
  ]);

  renderPipelineRef.current = renderPipeline;

  useEffect(() => {
    renderPipeline();
  }, [renderPipeline]);

  // Coordinate mapper
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const canvasX = (x / rect.width) * canvas.width;
    const canvasY = (y / rect.height) * canvas.height;

    return { x: canvasX, y: canvasY };
  };

  // Find slice containing coordinates (supports vertical/horizontal layouts)
  const findSliceAtCoords = (coords: { x: number; y: number }) => {
    if (images.length === 0) return null;
    const firstVisibleW = images[0].width - images[0].cropLeft - images[0].cropRight;
    const baseW = Math.max(50, firstVisibleW);

    if (direction === 'vertical') {
      let currentY = 0;
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const visibleW = img.width - img.cropLeft - img.cropRight;
        const visibleH = img.height - img.cropTop - img.cropBottom;

        const scale = baseW / Math.max(10, visibleW);
        const h = visibleH * scale;

        let overlap = i > 0 ? (overlaps[i - 1] || 0) * scale : 0;
        
        const adjustedStartY = currentY - overlap;
        const endY = adjustedStartY + h;

        if (coords.y >= adjustedStartY && coords.y <= endY) {
          return {
            sliceIndex: i,
            localY: coords.y - adjustedStartY,
            localX: coords.x,
            scale,
            startY: adjustedStartY,
            endY,
            startX: 0,
            endX: baseW
          };
        }

        currentY = adjustedStartY + h + gap;
      }
    } else {
      // Horizontal layout
      let currentX = 0;
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const visibleW = img.width - img.cropLeft - img.cropRight;
        const visibleH = img.height - img.cropTop - img.cropBottom;

        // Height is normalized to baseW
        const scale = baseW / Math.max(10, visibleH);
        const w = visibleW * scale;

        let overlap = i > 0 ? (overlaps[i - 1] || 0) * scale : 0;
        
        const adjustedStartX = currentX - overlap;
        const endX = adjustedStartX + w;

        if (coords.x >= adjustedStartX && coords.x <= endX) {
          return {
            sliceIndex: i,
            localY: coords.y,
            localX: coords.x - adjustedStartX,
            scale,
            startY: 0,
            endY: baseW,
            startX: adjustedStartX,
            endX
          };
        }

        currentX = adjustedStartX + w + gap;
      }
    }
    return null;
  };

  // --- Click & Drag Handling ---
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (textInput) {
      saveTextInput();
      return;
    }

    const coords = getCanvasCoords(e);
    if (!coords) return;

    const match = findSliceAtCoords(coords);
    if (!match) return;

    // --- Tab 1: STITCH Tab Dragging (adjust overlaps) ---
    if (activeTab === 'stitch' && selectedTool === 'select') {
      let targetJointIdx = match.sliceIndex - 1;
      if (match.sliceIndex === 0 && images.length > 1) {
        targetJointIdx = 0;
      }

      if (targetJointIdx >= 0) {
        setIsDrawing(true);
        setDragMode('overlap');
        setDraggedSliceIdx(targetJointIdx);
        setDragStartScreen({ x: e.clientX, y: e.clientY });
        setInitialVal(overlaps[targetJointIdx] || 0);
      }
      return;
    }

    // --- Tab 2: CUT Tab Splitting & Drag Cropping ---
    if (activeTab === 'cut') {
      const isCutToolSelected = selectedTool === 'cut-horizontal' || selectedTool === 'cut-vertical';
      
      if (isCutToolSelected) {
        // Split slice immediately at coordinates
        if (selectedTool === 'cut-horizontal') {
          onSplitImage(match.sliceIndex, match.localY, match.scale, 'horizontal');
        } else {
          onSplitImage(match.sliceIndex, match.localX, match.scale, 'vertical');
        }
        setHoverY(null);
        setHoverX(null);
        return;
      } else {
        // Drag to Crop: 
        // 1. In Vertical Stitching layout: clicking and dragging always adjusts cropTop or cropBottom.
        // 2. In Horizontal Stitching layout: clicking and dragging always adjusts cropLeft or cropRight.
        // This solves the stretching bug by preventing accidental cropLeft/Right triggers in vertical mode!
        setIsDrawing(true);
        setDragMode('crop');
        setDraggedSliceIdx(match.sliceIndex);
        setDragStartScreen({ x: e.clientX, y: e.clientY });

        if (direction === 'vertical') {
          const sliceH = match.endY - match.startY;
          if (match.localY > sliceH / 2) {
            setDraggedField('cropBottom');
            setInitialVal(images[match.sliceIndex].cropBottom);
          } else {
            setDraggedField('cropTop');
            setInitialVal(images[match.sliceIndex].cropTop);
          }
        } else {
          const sliceW = match.endX - match.startX;
          if (match.localX > sliceW / 2) {
            setDraggedField('cropRight');
            setInitialVal(images[match.sliceIndex].cropRight);
          } else {
            setDraggedField('cropLeft');
            setInitialVal(images[match.sliceIndex].cropLeft);
          }
        }
      }
      return;
    }

    // --- Tab 3: MARKUP Drawing ---
    if (activeTab === 'markup' && selectedTool !== 'select') {
      setIsDrawing(true);
      setStartPoint(coords);
      setCurrentPoint(coords);

      if (selectedTool === 'pen') {
        setPenPoints([coords]);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    // Hover effect for split line helper
    if (activeTab === 'cut' && !isDrawing) {
      if (selectedTool === 'cut-horizontal') {
        setHoverY(coords.y);
        setHoverX(null);
      } else if (selectedTool === 'cut-vertical') {
        setHoverX(coords.x);
        setHoverY(null);
      } else {
        setHoverX(null);
        setHoverY(null);
      }
    }

    if (!isDrawing) return;

    // 1. Overlap Dragging (in screen pixels)
    if (dragMode === 'overlap' && draggedSliceIdx >= 0 && dragStartScreen) {
      const screenDelta = direction === 'vertical' 
        ? e.clientY - dragStartScreen.y
        : e.clientX - dragStartScreen.x;
      const canvasDelta = screenDelta / zoom;

      // Dragging down/right decreases overlap, dragging up/left increases overlap
      const newVal = Math.max(0, Math.round(initialVal - canvasDelta));
      onAdjustOverlap(draggedSliceIdx, newVal);
      return;
    }

    // 2. Crop Dragging zones (in screen pixels)
    if (dragMode === 'crop' && draggedSliceIdx >= 0 && draggedField !== 'none' && dragStartScreen) {
      const screenDy = e.clientY - dragStartScreen.y;
      const screenDx = e.clientX - dragStartScreen.x;

      const slice = images[draggedSliceIdx];
      const sliceVisibleW = slice.width - slice.cropLeft - slice.cropRight;
      const sliceVisibleH = slice.height - slice.cropTop - slice.cropBottom;
      const firstVisibleW = images[0].width - images[0].cropLeft - images[0].cropRight;
      const baseW = Math.max(50, firstVisibleW);
      
      if (draggedField === 'cropTop' || draggedField === 'cropBottom') {
        const scale = direction === 'vertical' 
          ? baseW / Math.max(10, sliceVisibleW)
          : baseW / Math.max(10, sliceVisibleH);
        const canvasDy = (screenDy / zoom) / scale;

        if (draggedField === 'cropTop') {
          // Dragging UP crops MORE from top (increases cropTop)
          const newVal = Math.max(0, Math.round(initialVal - canvasDy));
          onAdjustCrop(draggedSliceIdx, 'cropTop', newVal);
        } else {
          // Dragging DOWN crops MORE from bottom (increases cropBottom)
          const newVal = Math.max(0, Math.round(initialVal + canvasDy));
          onAdjustCrop(draggedSliceIdx, 'cropBottom', newVal);
        }
      } else {
        const scale = direction === 'vertical'
          ? baseW / Math.max(10, sliceVisibleW)
          : baseW / Math.max(10, sliceVisibleH);
        const canvasDx = (screenDx / zoom) / scale;

        if (draggedField === 'cropLeft') {
          // Dragging RIGHT crops MORE from left (increases cropLeft)
          const newVal = Math.max(0, Math.round(initialVal + canvasDx));
          onAdjustCrop(draggedSliceIdx, 'cropLeft', newVal);
        } else {
          // Dragging LEFT crops MORE from right (increases cropRight)
          const newVal = Math.max(0, Math.round(initialVal - canvasDx));
          onAdjustCrop(draggedSliceIdx, 'cropRight', newVal);
        }
      }
      return;
    }

    // 3. Markup Drawing
    if (startPoint) {
      setCurrentPoint(coords);
      if (selectedTool === 'pen') {
        setPenPoints((prev) => [...prev, coords]);
      }
    }
  };

  const handleMouseUp = () => {
    if (dragMode !== 'none') {
      onDragEnd();
      setIsDrawing(false);
      setDragMode('none');
      setDraggedSliceIdx(-1);
      setDraggedField('none');
      setDragStartScreen(null);
      return;
    }

    if (!isDrawing || !startPoint || !currentPoint) return;
    setIsDrawing(false);

    const id = crypto.randomUUID();

    if (selectedTool === 'pen') {
      onAddAnnotation({
        id,
        type: 'pen',
        color,
        strokeWidth,
        points: penPoints
      });
    } else if (selectedTool === 'arrow') {
      onAddAnnotation({
        id,
        type: 'arrow',
        color,
        strokeWidth,
        startX: startPoint.x,
        startY: startPoint.y,
        endX: currentPoint.x,
        endY: currentPoint.y
      });
    } else if (selectedTool === 'rect') {
      onAddAnnotation({
        id,
        type: 'rect',
        color,
        strokeWidth,
        x: startPoint.x,
        y: startPoint.y,
        width: currentPoint.x - startPoint.x,
        height: currentPoint.y - startPoint.y
      });
    } else if (selectedTool === 'blur') {
      onAddAnnotation({
        id,
        type: 'blur',
        color: '#ffffff',
        strokeWidth: 0,
        x: startPoint.x,
        y: startPoint.y,
        width: currentPoint.x - startPoint.x,
        height: currentPoint.y - startPoint.y,
        blurType: 'pixel'
      });
    } else if (selectedTool === 'text') {
      setTextInput({
        x: startPoint.x,
        y: startPoint.y,
        val: ''
      });
    }

    setStartPoint(null);
    setCurrentPoint(null);
    setPenPoints([]);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const mockEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent<HTMLCanvasElement>;
      handleMouseDown(mockEvent);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      const mockEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent<HTMLCanvasElement>;
      handleMouseMove(mockEvent);
    }
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };

  const saveTextInput = () => {
    if (textInput && textInput.val.trim() !== '') {
      onAddAnnotation({
        id: crypto.randomUUID(),
        type: 'text',
        color,
        strokeWidth: 2,
        x: textInput.x,
        y: textInput.y,
        text: textInput.val,
        fontSize
      });
    }
    setTextInput(null);
  };

  const cursorClass = () => {
    if (activeTab === 'stitch') return 'cursor-ns-resize';
    if (activeTab === 'cut') {
      if (selectedTool === 'cut-horizontal' || selectedTool === 'cut-vertical') return 'cursor-crosshair';
      return 'cursor-row-resize';
    }
    if (activeTab === 'markup' && selectedTool !== 'select') return 'cursor-crosshair';
    return 'cursor-default';
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* 1. Zoom View Controller Floating Bar */}
      <div className="bg-dark-900/90 border border-dark-800/80 backdrop-blur-md px-4 py-2 rounded-xl flex items-center justify-between shadow-xl mb-4 shrink-0 mx-auto w-full max-w-[820px] gap-6 select-none z-20">
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-dark-800 rounded-lg text-gray-400 hover:text-gray-200 transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
            title="缩小"
            aria-label="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono font-bold text-gray-300 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-dark-800 rounded-lg text-gray-400 hover:text-gray-200 transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
            title="放大"
            aria-label="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <div className="h-4 w-px bg-dark-700/50" />

        <div className="flex items-center gap-2">
          <button
            onClick={handleFitWidth}
            className="flex items-center gap-1 px-2.5 py-1 bg-dark-805 hover:bg-dark-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-dark-750 transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
            title="铺满宽度"
          >
            <Maximize2 className="w-3.5 h-3.5 text-primary-400" />
            铺满宽度
          </button>

          <button
            onClick={handleFitHeight}
            className="flex items-center gap-1 px-2.5 py-1 bg-dark-805 hover:bg-dark-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-dark-750 transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
            title="完整高度"
          >
            <Minimize2 className="w-3.5 h-3.5 text-pink-400" />
            完整高度
          </button>

          <button
            onClick={handleResetZoom}
            className="px-2.5 py-1 bg-dark-850 hover:bg-dark-800 text-gray-400 hover:text-gray-200 rounded-lg text-xs font-semibold border border-dark-700/30 transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
          >
            1:1 原始
          </button>
        </div>

        <div className="h-4 w-px bg-dark-700/50" />

        <div className="flex items-center gap-1.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-dark-805 hover:bg-dark-800 disabled:opacity-40 disabled:hover:bg-dark-805 text-gray-300 hover:text-white disabled:text-gray-500 rounded-lg text-xs font-semibold border border-dark-750 transition cursor-pointer disabled:cursor-not-allowed select-none focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
            title="撤回最近一步 (最多可撤回5步)"
          >
            <Undo2 className="w-3.5 h-3.5 text-primary-400" />
            <span>撤销</span>
          </button>

          <button
            onClick={onResetAll}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/30 rounded-lg text-xs font-semibold transition cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-red-500 focus:outline-none"
            title="重置清空所有裁剪、分割和标注"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重置清空</span>
          </button>
        </div>
      </div>

      {/* Helper text display */}
      <div className="text-center text-[11px] text-gray-500 mb-2 font-medium">
        {activeTab === 'stitch' && '💡 提示：按住鼠标左键并在图片上【上下拖动】，可以直接调节相邻截图的重叠对齐。'}
        {activeTab === 'cut' && (selectedTool === 'cut-horizontal' || selectedTool === 'cut-vertical' 
          ? '💡 提示：在图片需要切割的位置【点击一下】插入分割线。' 
          : '💡 提示：在分割切片中【按住上下拖拽】，可以直接调节上下裁剪。')}
      </div>

      {/* 2. Main Scrollable Viewport (CSS Centering Scroll cutoff Fix) */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full flex overflow-auto p-6 bg-dark-900/40 rounded-2xl border border-dark-700/30"
      >
        {images.length === 0 ? (
          <div className="m-auto text-gray-500 text-sm flex flex-col items-center select-none">
            <p className="font-semibold text-gray-400 mb-1">画板预览区域</p>
            <p className="text-xs text-gray-500">上传图片后，这里会实时显示拼接与编辑效果</p>
          </div>
        ) : (
          <div className="m-auto relative shrink-0">
            {/* Main Canvas rendering everything */}
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseLeave={() => {
                setHoverY(null);
                setHoverX(null);
              }}
              style={{
                width: canvasRef.current ? `${canvasRef.current.width * zoom}px` : 'auto',
                height: canvasRef.current ? `${canvasRef.current.height * zoom}px` : 'auto',
                imageRendering: zoom > 1.0 ? 'pixelated' : 'auto'
              }}
              className={`shadow-2xl rounded-sm border border-primary-500/10 ${cursorClass()}`}
            />

            {/* Inline Text Input overlay */}
            {textInput && (
              <div
                className="absolute bg-dark-800 border border-primary-500 rounded-lg p-2 shadow-2xl z-50 flex flex-col gap-1.5"
                style={{
                  left: `${(textInput.x / (canvasRef.current?.width || 1)) * 100}%`,
                  top: `${(textInput.y / (canvasRef.current?.height || 1)) * 100}%`,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left'
                }}
              >
                <input
                  type="text"
                  autoFocus
                  maxLength={100}
                  value={textInput.val}
                  onChange={(e) => setTextInput({ ...textInput, val: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTextInput();
                    if (e.key === 'Escape') setTextInput(null);
                  }}
                  className="bg-dark-900 border border-dark-700 rounded px-2 py-1 text-xs text-white outline-hidden focus:border-primary-500 font-medium"
                  placeholder="输入标注内容..."
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setTextInput(null)}
                    className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-dark-700 rounded"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveTextInput}
                    className="px-1.5 py-0.5 text-[10px] bg-primary-600 text-white rounded hover:bg-primary-500"
                  >
                    确定
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
