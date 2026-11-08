import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Undo2,
  RotateCcw,
} from 'lucide-react';
import {
  drawArrow,
  drawAnchoredAnnotations,
  annotationBounds,
  mapAnnotation,
} from '../utils/annotations';
import { previewScaleFor } from '../utils/renderProject';
import { loadImage } from '../utils/stitching';
import { drawWatermark } from '../utils/watermark';
import type {
  StitchedImage,
  Annotation,
  AnnotationType,
  StatusBarConfig,
  MockupConfig,
  WatermarkConfig,
} from '../types';
import { drawStatusBar } from '../utils/statusBar';
import { drawMockup, mockupOutputSize } from '../utils/mockup';
import { canInteractWithCanvas } from '../utils/canvasInteraction';
import {
  getCropRect,
  getStitchedImageLocation,
  getStitchedLayout,
} from '../utils/imageState';

interface PreviewCanvasProps {
  images: StitchedImage[];
  direction: 'vertical' | 'horizontal';
  gap: number;
  overlaps: number[];
  statusBar: StatusBarConfig;
  mockup: MockupConfig;
  watermark: WatermarkConfig;
  annotations: Annotation[];
  selectedAnnotationId?: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAnnotation: (annotation: Annotation) => void;
  onAddAnnotation: (anno: Annotation) => void;
  selectedTool: AnnotationType | 'select' | 'cut-horizontal' | 'cut-vertical';
  activeTab: string;
  color: string;
  strokeWidth: number;
  fontSize: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Callback adjustments
  onAdjustOverlap: (idx: number, val: number) => void;
  onAdjustCrop: (
    sliceIndex: number,
    field: 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight',
    val: number
  ) => void;
  onSplitImage: (
    sliceIndex: number,
    relativeCoord: number,
    scale: number,
    type: 'horizontal' | 'vertical'
  ) => void;
  onDragEnd: () => void;

  onUndo: () => void;
  canUndo: boolean;
  onResetAll: () => void;
  compact?: boolean;
  focusSliceIndex?: number;
  focusedSeam?: { index: number; token: number } | null;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  images,
  direction,
  gap,
  overlaps,
  statusBar,
  mockup,
  watermark,
  annotations,
  onAddAnnotation,
  selectedAnnotationId,
  onSelectAnnotation,
  onUpdateAnnotation,
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
  onResetAll,
  compact = false,
  focusSliceIndex,
  focusedSeam = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const annotationDragRef = useRef<{
    original: Annotation;
    start: { x: number; y: number };
    scale: number;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    distance: number;
    zoom: number;
    anchorX: number;
    anchorY: number;
  } | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const pinchActive = useRef(false);
  const lastTap = useRef(0);
  const tap = useRef({ x: 0, y: 0, time: 0, moved: false });
  const lastPointerType = useRef('mouse');
  // Zoom State
  const [zoom, setZoom] = useState<number>(1.0);

  // Drawing & Dragging Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(
    null
  );
  const [currentPoint, setCurrentPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[]>([]);
  const [textInput, setTextInput] = useState<{
    x: number;
    y: number;
    val: string;
  } | null>(null);

  // Dragging alignment/crop state (using screen pixels to prevent canvas resize feedback loops)
  const [dragMode, setDragMode] = useState<'none' | 'overlap' | 'crop'>('none');
  const [draggedSliceIdx, setDraggedSliceIdx] = useState<number>(-1);
  const [draggedField, setDraggedField] = useState<
    'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight' | 'none'
  >('none');
  const [initialVal, setInitialVal] = useState<number>(0);
  const [dragStartScreen, setDragStartScreen] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Freeze the next slice's source-to-screen scale for the whole seam drag.
  const [overlapDragScale, setOverlapDragScale] = useState(1);

  // Hover guides for split line placement
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Image preloading cache (prevents browser decoding on every mousemove, unlocking 60fps drag performance)
  const imageCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const loadingPreview = useRef(new Set<string>());
  const decodeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const previewScale = useRef(1);
  const currentImageIds = useRef(new Set(images.map((i) => i.id)));
  currentImageIds.current = new Set(images.map((i) => i.id));
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderPipelineRef = useRef<(() => void) | null>(null);

  // Performance optimization: Cache the stitched background layer
  // Avoids 60fps full redraws when dragging annotations or splitting images
  const stitchedCacheCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastStitchDepsRef = useRef<string>('');

  // --- Zoom Controllers ---
  const handleZoomIn = () => setZoom((z) => Math.min(6.0, z + 0.1));
  const handleZoomOut = () => setZoom((z) => Math.max(0.05, z - 0.1));

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

  const navigationState = useRef({ images, overlaps, gap, zoom, focusedSeam });
  navigationState.current = { images, overlaps, gap, zoom, focusedSeam };
  const imageCount = images.length,
    seamToken = focusedSeam?.token;
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

  // When the editor switches source pictures, automatically reveal that
  // section of the *real* composite without changing the user's zoom.
  useEffect(() => {
    if (focusSliceIndex === undefined || focusSliceIndex < 0 || !imageCount)
      return;
    const timer = window.setTimeout(() => {
      const { images, overlaps, gap, zoom } = navigationState.current;
      const view = containerRef.current;
      const canvas = canvasRef.current;
      if (!view || !canvas) return;
      const { start, total } = getStitchedImageLocation(
        images,
        overlaps,
        gap,
        direction,
        focusSliceIndex
      );
      const fraction = Math.min(1, Math.max(0, start / Math.max(1, total)));
      const extent =
        (direction === 'vertical' ? canvas.height : canvas.width) * zoom;
      const widthAxis = direction === 'horizontal';
      const viewExtent = widthAxis ? view.clientWidth : view.clientHeight;
      const target = Math.max(0, fraction * extent - viewExtent * 0.23);
      if (widthAxis) view.scrollTo({ left: target, behavior: 'smooth' });
      else view.scrollTo({ top: target, behavior: 'smooth' });
    }, 280);
    return () => window.clearTimeout(timer);
    // Only follow an explicit picture selection; don't fight crop handle drag.
  }, [focusSliceIndex, direction, imageCount, canvasRef]);

  // Navigate the actual stitched canvas, never a slider inside the inspector.
  // The explicit token allows repeatedly selecting the same seam.
  useEffect(() => {
    const { focusedSeam, images, overlaps, gap } = navigationState.current;
    if (
      !focusedSeam ||
      focusedSeam.index < 0 ||
      focusedSeam.index >= imageCount - 1
    )
      return;
    const timer = window.setTimeout(() => {
      const view = containerRef.current;
      const canvas = canvasRef.current;
      if (!view || !canvas) return;
      const { start, total } = getStitchedImageLocation(
        images,
        overlaps,
        gap,
        direction,
        focusedSeam.index + 1
      );
      const position = Math.max(0, Math.min(1, start / Math.max(1, total)));
      const imageBox = canvas.getBoundingClientRect();
      const viewBox = view.getBoundingClientRect();
      const horizontal = direction === 'horizontal';
      const canvasPosition = horizontal
        ? imageBox.left -
          viewBox.left +
          view.scrollLeft +
          position * imageBox.width
        : imageBox.top -
          viewBox.top +
          view.scrollTop +
          position * imageBox.height;
      const extent = horizontal ? view.clientWidth : view.clientHeight;
      const desired = Math.max(0, canvasPosition - extent * 0.48);
      if (horizontal) view.scrollTo({ left: desired, behavior: 'smooth' });
      else view.scrollTo({ top: desired, behavior: 'smooth' });
    }, 180);
    return () => window.clearTimeout(timer);
    // Follow only an explicit navigation, not seam updates while dragging.
  }, [seamToken, direction, imageCount, canvasRef]);

  const focusedSeamFraction =
    focusedSeam &&
    focusedSeam.index >= 0 &&
    focusedSeam.index < images.length - 1
      ? (() => {
          const { start, total } = getStitchedImageLocation(
            images,
            overlaps,
            gap,
            direction,
            focusedSeam.index + 1
          );
          return Math.max(0, Math.min(1, start / Math.max(1, total)));
        })()
      : null;

  // Core Render Loop: Builds the stitched image + statusbar + crops
  const renderStitchedImage = useCallback((): HTMLCanvasElement => {
    const base = baseCanvasRef.current ?? document.createElement('canvas');
    baseCanvasRef.current = base;
    const layout = getStitchedLayout(images, overlaps, gap, direction);
    const frame = mockupOutputSize(layout.width, layout.height, mockup);
    const ratio = Math.min(
      previewScaleFor(layout.width, layout.height),
      previewScaleFor(frame.width, frame.height)
    );
    previewScale.current = ratio;
    const deps = JSON.stringify([
      images.map((i) => [
        i.id,
        i.cropTop,
        i.cropBottom,
        i.cropLeft,
        i.cropRight,
      ]),
      overlaps,
      gap,
      direction,
      statusBar,
      ratio,
    ]);
    for (const [id, canvas] of imageCacheRef.current)
      if (!currentImageIds.current.has(id)) {
        canvas.width = canvas.height = 0;
        imageCacheRef.current.delete(id);
      }
    for (const image of images)
      if (
        !imageCacheRef.current.has(image.id) &&
        !loadingPreview.current.has(image.id)
      ) {
        loadingPreview.current.add(image.id);
        decodeQueue.current = decodeQueue.current
          .catch(() => {})
          .then(async () => {
            const source = await loadImage(image.src);
            if (!currentImageIds.current.has(image.id)) {
              source.src = '';
              return;
            }
            const scale = Math.min(
              1,
              1536 / source.naturalWidth,
              Math.sqrt(
                2_000_000 / (source.naturalWidth * source.naturalHeight)
              )
            );
            const thumbnail = document.createElement('canvas');
            thumbnail.width = Math.max(
              1,
              Math.round(source.naturalWidth * scale)
            );
            thumbnail.height = Math.max(
              1,
              Math.round(source.naturalHeight * scale)
            );
            thumbnail
              .getContext('2d')!
              .drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
            source.src = '';
            imageCacheRef.current.set(image.id, thumbnail);
          })
          .catch((error) => console.error('Preview decode failed', error))
          .finally(() => {
            loadingPreview.current.delete(image.id);
            lastStitchDepsRef.current = '';
            renderPipelineRef.current?.();
          });
      }
    const cache =
      stitchedCacheCanvasRef.current ?? document.createElement('canvas');
    stitchedCacheCanvasRef.current = cache;
    const width = Math.max(1, Math.floor(layout.width * ratio)),
      height = Math.max(1, Math.floor(layout.height * ratio));
    if (lastStitchDepsRef.current !== deps) {
      cache.width = width;
      cache.height = height;
      const ctx = cache.getContext('2d')!;
      ctx.fillStyle = '#0f0f12';
      ctx.fillRect(0, 0, width, height);
      ctx.scale(ratio, ratio);
      for (const p of layout.placements) {
        const source = imageCacheRef.current.get(p.image.id);
        if (!source) continue;
        const sx = source.width / p.image.width,
          sy = source.height / p.image.height;
        ctx.drawImage(
          source,
          p.crop.left * sx,
          p.crop.top * sy,
          p.crop.width * sx,
          p.crop.height * sy,
          p.x,
          p.y,
          p.width,
          p.height
        );
      }
      if (statusBar.enabled && direction === 'vertical')
        drawStatusBar(
          ctx,
          layout.width,
          Math.round(layout.width * 0.05),
          statusBar
        );
      if (images.every((i) => imageCacheRef.current.has(i.id)))
        lastStitchDepsRef.current = deps;
    }
    if (base.width !== width) base.width = width;
    if (base.height !== height) base.height = height;
    const ctx = base.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(cache, 0, 0);
    return base;
  }, [images, overlaps, gap, direction, statusBar, mockup]);

  // Main Pipeline: Composes base stitched image + mockup wrap + annotations
  const renderPipeline = useCallback(() => {
    if (images.length === 0 || !canvasRef.current) return;

    // Step A: Stitch images + Status bar + Crops
    const baseStitchedCanvas = renderStitchedImage();

    // Step B: Render annotations
    const baseCtx = baseStitchedCanvas.getContext('2d');
    if (baseCtx) {
      const ratio = previewScale.current;
      drawAnchoredAnnotations(
        baseCtx,
        annotations.map((a) => (a.imageId ? a : mapAnnotation(a, ratio, 0, 0))),
        getStitchedLayout(images, overlaps, gap, direction).placements.map(
          (p) => ({
            ...p,
            x: p.x * ratio,
            y: p.y * ratio,
            width: p.width * ratio,
            height: p.height * ratio,
            scale: p.scale * ratio,
          })
        )
      );
      baseCtx.save();
      baseCtx.scale(ratio, ratio);

      // Render active pen/arrow/shape drawing
      if (
        isDrawing &&
        startPoint &&
        currentPoint &&
        selectedTool !== 'cut-horizontal' &&
        selectedTool !== 'cut-vertical' &&
        dragMode === 'none'
      ) {
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
          drawArrow(
            baseCtx,
            startPoint.x,
            startPoint.y,
            currentPoint.x,
            currentPoint.y,
            strokeWidth
          );
        } else if (selectedTool === 'rect') {
          baseCtx.strokeRect(
            startPoint.x,
            startPoint.y,
            currentPoint.x - startPoint.x,
            currentPoint.y - startPoint.y
          );
        } else if (selectedTool === 'blur') {
          baseCtx.strokeStyle = '#c084fc';
          baseCtx.lineWidth = 2;
          baseCtx.setLineDash([6, 4]);
          baseCtx.strokeRect(
            startPoint.x,
            startPoint.y,
            currentPoint.x - startPoint.x,
            currentPoint.y - startPoint.y
          );
        }
        baseCtx.restore();
      }

      // Render Cut seams / Split lines clearly when in Cut tab
      if (activeTab === 'cut') {
        baseCtx.save();
        baseCtx.strokeStyle = '#f43f5e'; // Rose color for seams
        baseCtx.lineWidth = 2;
        baseCtx.setLineDash([6, 3]);

        const firstVisibleW =
          images[0].width - images[0].cropLeft - images[0].cropRight;
        const baseW = Math.max(
          50,
          direction === 'vertical'
            ? firstVisibleW
            : images[0].height - images[0].cropTop - images[0].cropBottom
        );
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
      if (
        activeTab === 'cut' &&
        selectedTool === 'cut-horizontal' &&
        hoverY !== null &&
        !isDrawing
      ) {
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

      if (
        activeTab === 'cut' &&
        selectedTool === 'cut-vertical' &&
        hoverX !== null &&
        !isDrawing
      ) {
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

    baseCtx?.restore();
    // Step C: Apply Mockup wrapper (only if mockup is enabled and not editing cuts/markup)
    const isEditingMode =
      activeTab === 'markup' || activeTab === 'cut' || activeTab === 'stitch';
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
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
        }
        ctx.drawImage(baseStitchedCanvas, 0, 0);
      }
    }
    // Place watermarks above the final screenshot or mockup, not into the
    // cached stitching bitmap. This keeps previews and exported output equal.
    drawWatermark(canvasRef.current, watermark);
  }, [
    images,
    direction,
    gap,
    overlaps,
    mockup,
    watermark,
    annotations,
    isDrawing,
    startPoint,
    currentPoint,
    selectedTool,
    dragMode,
    color,
    strokeWidth,
    penPoints,
    activeTab,
    hoverY,
    hoverX,
    canvasRef,
    renderStitchedImage,
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

    return {
      x: canvasX / previewScale.current,
      y: canvasY / previewScale.current,
    };
  };

  // Find slice containing coordinates (supports vertical/horizontal layouts)
  const findSliceAtCoords = (coords: { x: number; y: number }) => {
    const { placements } = getStitchedLayout(images, overlaps, gap, direction);
    const pos = [...placements]
      .reverse()
      .find(
        (p) =>
          coords.x >= p.x &&
          coords.x < p.x + p.width &&
          coords.y >= p.y &&
          coords.y < p.y + p.height
      );
    return pos
      ? {
          sliceIndex: pos.index,
          localX: coords.x - pos.x,
          localY: coords.y - pos.y,
          scale: pos.scale,
          startX: pos.x,
          startY: pos.y,
          endX: pos.x + pos.width,
          endY: pos.y + pos.height,
        }
      : null;
  };

  // --- Click & Drag Handling ---
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (textInput) {
      saveTextInput();
      return;
    }

    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (activeTab === 'markup' && selectedTool === 'select') {
      const layout = getStitchedLayout(images, overlaps, gap, direction);
      const hit = [...annotations].reverse().find((anno) => {
        const p = layout.placements.find(
          (p) => (p.image.originalId ?? p.image.id) === anno.imageId
        );
        if (anno.imageId && !p) return false;
        const shown = p
          ? mapAnnotation(
              anno,
              p.scale,
              p.x - p.crop.left * p.scale,
              p.y - p.crop.top * p.scale
            )
          : anno;
        const b = annotationBounds(shown);
        return (
          coords.x >= b.left - 8 &&
          coords.x <= b.right + 8 &&
          coords.y >= b.top - 8 &&
          coords.y <= b.bottom + 8
        );
      });
      onSelectAnnotation(hit?.id ?? null);
      if (hit) {
        const p = layout.placements.find(
          (p) => (p.image.originalId ?? p.image.id) === hit.imageId
        );
        annotationDragRef.current = {
          original: hit,
          start: coords,
          scale: p?.scale ?? 1,
        };
      }
      return;
    }
    const match = findSliceAtCoords(coords);
    if (!match) return;

    // --- Tab 1: STITCH Tab Dragging (adjust overlaps) ---
    if (activeTab === 'stitch' && selectedTool === 'select') {
      let targetJointIdx = match.sliceIndex - 1;
      if (match.sliceIndex === 0 && images.length > 1) {
        targetJointIdx = 0;
      }

      if (targetJointIdx >= 0) {
        // Seam values use the NEXT image's source pixels, even when the
        // gesture starts on the first image. Zoom alone is insufficient
        // when differently sized images are normalized for stitching.
        const firstCrop = getCropRect(images[0]);
        const nextCrop = getCropRect(images[targetJointIdx + 1]);
        const vertical = direction === 'vertical';
        const base = Math.max(
          50,
          vertical ? firstCrop.width : firstCrop.height
        );
        const imageScale =
          base / Math.max(10, vertical ? nextCrop.width : nextCrop.height);
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const screenScale = vertical
          ? rect.height / canvas.height
          : rect.width / canvas.width;
        setOverlapDragScale(imageScale * screenScale * previewScale.current);
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
      const isCutToolSelected =
        selectedTool === 'cut-horizontal' || selectedTool === 'cut-vertical';

      if (isCutToolSelected) {
        // Split slice immediately at coordinates
        if (selectedTool === 'cut-horizontal') {
          onSplitImage(
            match.sliceIndex,
            match.localY,
            match.scale,
            'horizontal'
          );
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

    const annotationDrag = annotationDragRef.current;
    if (annotationDrag) {
      onUpdateAnnotation(
        mapAnnotation(
          annotationDrag.original,
          1,
          (coords.x - annotationDrag.start.x) / annotationDrag.scale,
          (coords.y - annotationDrag.start.y) / annotationDrag.scale
        )
      );
      return;
    }
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
      const screenDelta =
        direction === 'vertical'
          ? e.clientY - dragStartScreen.y
          : e.clientX - dragStartScreen.x;
      const sourceDelta = screenDelta / overlapDragScale;

      // Dragging down/right decreases overlap, dragging up/left increases overlap
      const newVal = Math.max(0, Math.round(initialVal - sourceDelta));
      onAdjustOverlap(draggedSliceIdx, newVal);
      return;
    }

    // 2. Crop Dragging zones (in screen pixels)
    if (
      dragMode === 'crop' &&
      draggedSliceIdx >= 0 &&
      draggedField !== 'none' &&
      dragStartScreen
    ) {
      const screenDy = e.clientY - dragStartScreen.y;
      const screenDx = e.clientX - dragStartScreen.x;

      const slice = images[draggedSliceIdx];
      const sliceVisibleW = slice.width - slice.cropLeft - slice.cropRight;
      const sliceVisibleH = slice.height - slice.cropTop - slice.cropBottom;
      const firstVisibleW =
        images[0].width - images[0].cropLeft - images[0].cropRight;
      const baseW = Math.max(
        50,
        direction === 'vertical'
          ? firstVisibleW
          : images[0].height - images[0].cropTop - images[0].cropBottom
      );

      if (draggedField === 'cropTop' || draggedField === 'cropBottom') {
        const scale =
          direction === 'vertical'
            ? baseW / Math.max(10, sliceVisibleW)
            : baseW / Math.max(10, sliceVisibleH);
        const canvasDy = screenDy / zoom / (scale * previewScale.current);

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
        const scale =
          direction === 'vertical'
            ? baseW / Math.max(10, sliceVisibleW)
            : baseW / Math.max(10, sliceVisibleH);
        const canvasDx = screenDx / zoom / (scale * previewScale.current);

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
    if (annotationDragRef.current) {
      annotationDragRef.current = null;
      onDragEnd();
      return;
    }
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
        points: penPoints,
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
        endY: currentPoint.y,
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
        height: currentPoint.y - startPoint.y,
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
        blurType: 'pixel',
      });
    } else if (selectedTool === 'text') {
      setTextInput({
        x: startPoint.x,
        y: startPoint.y,
        val: '',
      });
    }

    setStartPoint(null);
    setCurrentPoint(null);
    setPenPoints([]);
  };

  const cancelGesture = () => {
    setIsDrawing(false);
    setDragMode('none');
    setDraggedSliceIdx(-1);
    setDraggedField('none');
    setDragStartScreen(null);
    setStartPoint(null);
    setCurrentPoint(null);
    setPenPoints([]);
    annotationDragRef.current = null;
  };
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPointerType.current = e.pointerType;
    tap.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      moved: false,
    };
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = e.currentTarget.getBoundingClientRect();
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
        anchorX:
          (((a.x + b.x) / 2 - rect.left) / rect.width) * e.currentTarget.width,
        anchorY:
          (((a.y + b.y) / 2 - rect.top) / rect.height) * e.currentTarget.height,
      };
      pinchActive.current = true;
      lastTap.current = 0;
      if (dragMode !== 'none') onDragEnd();
      cancelGesture();
      return;
    }
    if (!canInteractWithCanvas(activeTab))
      pan.current = { x: e.clientX, y: e.clientY };
    else handleMouseDown(e);
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) {
      handleMouseMove(e);
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 8)
      tap.current.moved = true;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const state = pinch.current,
        nextZoom = Math.max(
          0.05,
          Math.min(
            6,
            (state.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
              Math.max(1, state.distance)
          )
        );
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        const canvas = canvasRef.current,
          view = containerRef.current;
        if (!canvas || !view) return;
        const rect = canvas.getBoundingClientRect();
        view.scrollBy(
          rect.left + state.anchorX * nextZoom - (a.x + b.x) / 2,
          rect.top + state.anchorY * nextZoom - (a.y + b.y) / 2
        );
      });
      return;
    }
    if (pinchActive.current) return;
    if (pan.current && containerRef.current) {
      containerRef.current.scrollBy(
        pan.current.x - e.clientX,
        pan.current.y - e.clientY
      );
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    handleMouseMove(e);
    if (
      activeTab === 'markup' &&
      (isDrawing || annotationDragRef.current) &&
      containerRef.current
    ) {
      const r = containerRef.current.getBoundingClientRect();
      containerRef.current.scrollBy(
        e.clientX < r.left + 24 ? -12 : e.clientX > r.right - 24 ? 12 : 0,
        e.clientY < r.top + 24 ? -12 : e.clientY > r.bottom - 24 ? 12 : 0
      );
    }
  };
  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinchActive.current) {
      if (!pointers.current.size) {
        pinchActive.current = false;
        pinch.current = null;
      }
      return;
    }
    if (
      pan.current &&
      e.pointerType === 'touch' &&
      !tap.current.moved &&
      Date.now() - tap.current.time < 300
    ) {
      const now = Date.now();
      if (now - lastTap.current < 280)
        setZoom((z) => (z > 1 ? 1 : Math.min(6, z * 2)));
      lastTap.current = now;
    }
    pan.current = null;
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
        fontSize,
      });
    }
    setTextInput(null);
  };

  const cursorClass = () => {
    if (activeTab === 'stitch')
      return direction === 'vertical' ? 'cursor-ns-resize' : 'cursor-ew-resize';
    if (activeTab === 'cut') {
      if (selectedTool === 'cut-horizontal' || selectedTool === 'cut-vertical')
        return 'cursor-crosshair';
      return 'cursor-row-resize';
    }
    if (activeTab === 'markup' && selectedTool !== 'select')
      return 'cursor-crosshair';
    return 'cursor-default';
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* Compact output preview: only the zoom operations needed during cropping. */}
      {compact && (
        <div className="crop-preview-toolbar">
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> 实时画布
          </span>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <button
              type="button"
              onClick={handleFitWidth}
              className="crop-preview-action"
            >
              适宽
            </button>
            <button
              type="button"
              onClick={handleFitHeight}
              className="crop-preview-action"
            >
              全览
            </button>
            <span className="font-mono">{Math.round(zoom * 100)}%</span>
          </div>
        </div>
      )}
      {!compact && (
        <div className="bg-slate-50 border border-slate-200 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center justify-between shadow-sm mb-3 shrink-0 mx-auto w-auto max-w-full gap-2 select-none z-20">
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-700 transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
              title="缩小"
              aria-label="缩小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold text-slate-700 w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-700 transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
              title="放大"
              aria-label="放大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div className="h-4 w-px bg-slate-50" />

          <div className="flex items-center gap-2">
            <button
              onClick={handleFitWidth}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-white rounded-lg text-xs font-medium border border-slate-200 transition"
              title="铺满宽度"
            >
              <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
              适宽
            </button>

            <button
              onClick={handleFitHeight}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-white rounded-lg text-xs font-medium border border-slate-200 transition"
              title="完整高度"
            >
              <Minimize2 className="w-3.5 h-3.5 text-pink-400" />
              适高
            </button>

            <button
              onClick={handleResetZoom}
              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition"
            >
              100%
            </button>
          </div>

          <div className="h-4 w-px bg-slate-50" />

          <div className="flex items-center gap-1.5">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-slate-100 text-slate-700 hover:text-white disabled:text-slate-500 rounded-lg text-xs font-semibold border border-slate-200 transition cursor-pointer disabled:cursor-not-allowed select-none"
              title="撤回最近一步 (最多可撤回50步)"
            >
              <Undo2 className="w-3.5 h-3.5 text-blue-600" />
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
      )}

      {/* Helper text display */}
      {!compact && (
        <div className="text-center text-[11px] text-slate-500 mb-2 font-medium">
          {activeTab === 'stitch' && '拖动画面即可调整接缝，或使用右侧精调。'}
          {activeTab === 'cut' &&
            (selectedTool === 'cut-horizontal' ||
            selectedTool === 'cut-vertical'
              ? '点击画布以放置分割线。'
              : '拖动边缘调整裁剪范围。')}
        </div>
      )}

      {/* 2. Main Scrollable Viewport (CSS Centering Scroll cutoff Fix) */}
      <div
        ref={containerRef}
        className={
          compact
            ? 'flex-1 min-h-0 w-full flex overflow-auto p-2 bg-white/70 rounded-xl border border-slate-200/80'
            : 'flex-1 w-full h-full flex overflow-auto p-4 md:p-6 bg-white/60 rounded-2xl border border-slate-200/80'
        }
      >
        {images.length === 0 ? (
          <div className="m-auto text-slate-500 text-sm flex flex-col items-center select-none">
            <p className="font-semibold text-slate-600 mb-1">画板预览区域</p>
            <p className="text-xs text-slate-500">
              上传图片后，这里会实时显示拼接与编辑效果
            </p>
          </div>
        ) : (
          <div
            className="m-auto relative shrink-0"
            data-focused-seam={focusedSeam?.index ?? ''}
          >
            {/* Highlight is HTML, not painted into the export canvas. */}
            {focusedSeamFraction !== null && (
              <div
                data-seam-highlight={focusedSeam?.index}
                role="status"
                aria-label={`当前接缝 ${(focusedSeam?.index ?? 0) + 1}`}
                className={`pointer-events-none absolute z-10 border-blue-500 ${
                  direction === 'vertical'
                    ? 'left-0 right-0 border-t-[3px]'
                    : 'top-0 bottom-0 border-l-[3px]'
                }`}
                style={
                  direction === 'vertical'
                    ? { top: `${focusedSeamFraction * 100}%` }
                    : { left: `${focusedSeamFraction * 100}%` }
                }
              >
                <span className="absolute left-1 top-1 rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-bold text-white shadow-lg">
                  接缝 {(focusedSeam?.index ?? 0) + 1}
                </span>
              </div>
            )}
            {activeTab === 'markup' &&
              selectedAnnotationId &&
              (() => {
                const anno = annotations.find(
                  (a) => a.id === selectedAnnotationId
                );
                if (!anno) return null;
                const p = getStitchedLayout(
                  images,
                  overlaps,
                  gap,
                  direction
                ).placements.find(
                  (p) => (p.image.originalId ?? p.image.id) === anno.imageId
                );
                const b = annotationBounds(
                  p
                    ? mapAnnotation(
                        anno,
                        p.scale,
                        p.x - p.crop.left * p.scale,
                        p.y - p.crop.top * p.scale
                      )
                    : anno
                );
                return (
                  <div
                    data-annotation-selection
                    className="pointer-events-none absolute z-10 border-2 border-blue-500"
                    style={{
                      left: b.left * zoom * previewScale.current,
                      top: b.top * zoom * previewScale.current,
                      width:
                        Math.max(6, b.right - b.left) *
                        zoom *
                        previewScale.current,
                      height:
                        Math.max(6, b.bottom - b.top) *
                        zoom *
                        previewScale.current,
                    }}
                  />
                );
              })()}
            {/* Main Canvas rendering everything */}
            <canvas
              ref={canvasRef}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={(e) => {
                pointers.current.delete(e.pointerId);
                pan.current = null;
                pinch.current = null;
                pinchActive.current = false;
                cancelGesture();
                onDragEnd();
              }}
              onDoubleClick={() => {
                if (lastPointerType.current === 'mouse')
                  setZoom((z) => (z > 1 ? 1 : Math.min(6, z * 2)));
              }}
              onMouseLeave={() => {
                setHoverY(null);
                setHoverX(null);
              }}
              style={{
                touchAction: 'none',
                width: canvasRef.current
                  ? `${canvasRef.current.width * zoom}px`
                  : 'auto',
                height: canvasRef.current
                  ? `${canvasRef.current.height * zoom}px`
                  : 'auto',
                imageRendering: zoom > 1.0 ? 'pixelated' : 'auto',
              }}
              className={`shadow-2xl rounded-sm border border-primary-500/10 ${cursorClass()}`}
            />

            {/* Inline Text Input overlay */}
            {textInput && (
              <div
                className="absolute bg-slate-50 border border-primary-500 rounded-lg p-2 shadow-2xl z-50 flex flex-col gap-1.5"
                style={{
                  left: `${(textInput.x / (canvasRef.current?.width || 1)) * 100}%`,
                  top: `${(textInput.y / (canvasRef.current?.height || 1)) * 100}%`,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                }}
              >
                <input
                  type="text"
                  autoFocus
                  maxLength={100}
                  value={textInput.val}
                  onChange={(e) =>
                    setTextInput({ ...textInput, val: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTextInput();
                    if (e.key === 'Escape') setTextInput(null);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-white outline-hidden focus:border-primary-500 font-medium"
                  placeholder="输入标注内容..."
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setTextInput(null)}
                    className="px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 rounded"
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
