import { useState, useRef, useEffect } from 'react';
import {
  Smartphone, RefreshCw, Images, WandSparkles, PencilRuler, AlertTriangle,
  Sparkles, Download, Plus, X, Check, ChevronRight
} from 'lucide-react';
import type {
  StitchedImage,
  Annotation,
  AnnotationType,
  StatusBarConfig,
  MockupConfig,
  ExportConfig,
  WatermarkConfig
} from './types';
import { ImageUploader } from './components/ImageUploader';
import { ControlPanel } from './components/ControlPanel';
import { ImageCropEditor } from './components/ImageCropEditor';
import { PreviewCanvas } from './components/PreviewCanvas';
import { detectOverlapDetailed, loadImage, visibleImageSource } from './utils/stitching';
import { clampCropValue, clampOverlapsToVisibleImages, restoreOriginalImages } from './utils/imageState';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { planPdfExport } from './utils/pdfExport';

interface HistoryState {
  images: StitchedImage[];
  overlaps: number[];
  annotations: Annotation[];
}

function App() {
  // Images/Slices list
  const [images, setImages] = useState<StitchedImage[]>([]);
  const [cropSelectedId, setCropSelectedId] = useState<string | null>(null);
  const [advancedCutOpen, setAdvancedCutOpen] = useState(false);
  // Overlaps between adjacent slices
  const [overlaps, setOverlaps] = useState<number[]>([]);
  // A low-confidence join must be highlighted for review, never silently trimmed.
  const [uncertainSeams, setUncertainSeams] = useState<number[]>([]);
  
  // Stitching process states
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical');
  const [gap, setGap] = useState<number>(0);
  const [isStitching, setIsStitching] = useState<boolean>(false);

  // Mobile responsiveness check
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<string>('stitch');
  const [panelOpen, setPanelOpen] = useState(false);

  // Annotation/Markup parameters
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedTool, setSelectedTool] = useState<AnnotationType | 'select' | 'cut-horizontal' | 'cut-vertical'>('select');
  const [color, setColor] = useState<string>('#ff3b30'); // Red
  const [strokeWidth, setStrokeWidth] = useState<number>(5);
  const [fontSize, setFontSize] = useState<number>(24);

  // Unified Undo/Redo stacks
  const [history, setHistory] = useState<HistoryState[]>([{ images: [], overlaps: [], annotations: [] }]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [copyStatus, setCopyStatus] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const exportInFlightRef = useRef(false);
  const [watermark, setWatermark] = useState<WatermarkConfig>({
    enabled: false,
    text: 'Picsew Web',
    opacity: 0.18,
    angle: -25,
    size: 36,
    repeat: true,
    color: '#1e3a8a'
  });

  // Status Bar Overlays config
  const [statusBar, setStatusBar] = useState<StatusBarConfig>({
    enabled: false,
    time: '09:41',
    battery: 100,
    wifi: 'wifi',
    style: 'light',
  });

  // Mockups device shell config
  const [mockup, setMockup] = useState<MockupConfig>({
    device: 'none',
    bgColorType: 'gradient',
    bgGradientStart: '#8b5cf6',
    bgGradientEnd: '#ec4899',
    bgSolid: '#18181b',
    padding: 40,
    shadow: true,
    extendBottom: true,
  });

  // Export configs
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    format: 'png',
    quality: 0.9,
    scale: 0,
    pdfPageMode: 'single',
  });

  // Canvas Reference to fetch rendered bitmap
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Ignore the results of an older asynchronous image list change.
  const imageChangeSequenceRef = useRef(0);

  // Helper to commit state change and record history
  const commitState = (newImgs: StitchedImage[], newOverlaps: number[], newAnnos: Annotation[]) => {
    setImages(newImgs);
    setOverlaps(newOverlaps);
    setAnnotations(newAnnos);

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      images: newImgs.map(img => ({ ...img })),
      overlaps: [...newOverlaps],
      annotations: newAnnos.map(anno => {
        if (anno.type === 'pen') {
          return { ...anno, points: [...anno.points] };
        }
        return { ...anno };
      })
    });

    // Capping undo history to at most 5 steps back (meaning max 6 states total: initial state + 5 edits)
    if (newHistory.length > 6) {
      newHistory.shift();
    }

    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Reset independently of the bounded undo history.
  const handleResetAll = () => {
    if (!images.length) return;
    if (window.confirm('确定要重置全部裁剪、分割、重合度和标注吗？')) {
      const resetImages = restoreOriginalImages(images);
      commitState(resetImages, Array(Math.max(0, resetImages.length - 1)).fill(0), []);
      setUncertainSeams([]);
      setSelectedTool('select');
    }
  };

  // Keep manually adjusted overlaps only while the same two images remain adjacent.
  // Reorder/removal must not inherit an overlap from a different image pair.
  const handleImagesChange = async (newImgs: StitchedImage[]) => {
    const sequence = ++imageChangeSequenceRef.current;
    const previousPairs = new Map<string, { pixels: number; review: boolean }>();
    for (let i = 0; i < images.length - 1; i++) {
      previousPairs.set(`${images[i].id}:${images[i + 1].id}`, {
        pixels: overlaps[i] ?? 0,
        review: uncertainSeams.includes(i)
      });
    }

    const decodedImages = new Map<string, HTMLImageElement>();
    const getDecoded = async (img: StitchedImage): Promise<HTMLImageElement> => {
      const cached = decodedImages.get(img.id);
      if (cached) return cached;
      const element = await loadImage(img.src);
      decodedImages.set(img.id, element);
      return element;
    };

    const newOverlaps: number[] = [];
    const newWarnings: number[] = [];
    for (let i = 0; i < newImgs.length - 1; i++) {
      const pair = `${newImgs[i].id}:${newImgs[i + 1].id}`;
      if (previousPairs.has(pair)) {
        const previous = previousPairs.get(pair)!;
        newOverlaps.push(previous.pixels);
        if (previous.review) newWarnings.push(i);
        continue;
      }

      try {
        const [first, second] = await Promise.all([
          getDecoded(newImgs[i]),
          getDecoded(newImgs[i + 1])
        ]);
        const match = detectOverlapDetailed(
          visibleImageSource(first, newImgs[i]),
          visibleImageSource(second, newImgs[i+1]), undefined, direction);
        newOverlaps.push(match.overlap);
        if (match.confidence !== 'high') newWarnings.push(i);
      } catch (error) {
        console.error('Error calculating overlap', error);
        newOverlaps.push(0);
        newWarnings.push(i);
      }
      if (sequence !== imageChangeSequenceRef.current) return;
    }

    if (sequence !== imageChangeSequenceRef.current) return;
    commitState(newImgs, clampOverlapsToVisibleImages(newImgs, newOverlaps, direction), annotations);
    setUncertainSeams(newWarnings);
    // Importing a new batch immediately returns to the finished canvas.
    if (newImgs.length > images.length) {
      setActiveTab('stitch');
      setPanelOpen(false);
      setSelectedTool('select');
    }
  };

  // --- Auto Stitching Logic ---
  const handleAutoStitch = async () => {
    if (images.length < 2) return;
    const sequence = ++imageChangeSequenceRef.current;
    setIsStitching(true);
    
    try {
      const newOverlaps: number[] = [];
      const warnings: number[] = [];
      let previousImage: HTMLImageElement | null = null;
      for (let i = 0; i < images.length - 1; i++) {
        const imgA: HTMLImageElement = previousImage ?? await loadImage(images[i].src);
        const imgB = await loadImage(images[i + 1].src);
        const match = detectOverlapDetailed(
          visibleImageSource(imgA, images[i]),
          visibleImageSource(imgB, images[i + 1]), undefined, direction);
        if (imageChangeSequenceRef.current !== sequence) return;
        newOverlaps.push(match.overlap);
        if (match.confidence !== 'high') warnings.push(i);
        previousImage = imgB;
      }
      
      if (imageChangeSequenceRef.current !== sequence) return;
      // Automatic alignment must not unexpectedly erase manual cropping.
      commitState(images, clampOverlapsToVisibleImages(images, newOverlaps, direction), annotations);
      setUncertainSeams(warnings);
      setActiveTab('stitch');
    } catch (err) {
      console.error('Error during auto stitching', err);
      alert('自动拼接算法出错，请尝试拖动手动微调！');
    } finally {
      if (imageChangeSequenceRef.current === sequence) setIsStitching(false);
    }
  };

  const handleDirectionChange = async (nextDirection: 'vertical' | 'horizontal') => {
    if (nextDirection === direction) return;
    const sequence = ++imageChangeSequenceRef.current;
    setDirection(nextDirection);
    // Old seam values belong to a different axis; never reuse them.
    setOverlaps(Array(Math.max(0, images.length - 1)).fill(0));
    setUncertainSeams([]);
    if (images.length < 2) return;
    setIsStitching(true);
    try {
      const detected: number[] = [];
      const warnings: number[] = [];
      let previous: HTMLImageElement | null = null;
      for (let i = 0; i < images.length - 1; i++) {
        const first: HTMLImageElement = previous ?? await loadImage(images[i].src);
        const second = await loadImage(images[i + 1].src);
        const match = detectOverlapDetailed(
          visibleImageSource(first, images[i]),
          visibleImageSource(second, images[i + 1]), undefined, nextDirection);
        if (imageChangeSequenceRef.current !== sequence) return;
        detected.push(match.overlap);
        if (match.confidence !== 'high') warnings.push(i);
        previous = second;
      }
      if (imageChangeSequenceRef.current !== sequence) return;
      commitState(images, clampOverlapsToVisibleImages(images, detected, nextDirection), annotations);
      setUncertainSeams(warnings);
    } catch (error) {
      console.error('Cannot recalculate overlap after switching direction', error);
    } finally {
      if (imageChangeSequenceRef.current === sequence) setIsStitching(false);
    }
  };

  const openTool = (tab: string) => {
    if (panelOpen && activeTab === tab) {
      setPanelOpen(false);
      setActiveTab('stitch');
      setSelectedTool('select');
      return;
    }
    setActiveTab(tab);
    setAdvancedCutOpen(false);
    setPanelOpen(true);
    setSelectedTool(tab === 'markup' ? 'pen' : 'select');
  };

  const closePanel = () => {
    setPanelOpen(false);
    setAdvancedCutOpen(false);
    // Leaving annotation mode must not keep the pen active.
    setActiveTab('stitch');
    setSelectedTool('select');
  };

  useEffect(() => {
    if (!panelOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [panelOpen]);

  // --- Drawing History / Undo-Redo Stack ---
  const handleAddAnnotation = (anno: Annotation) => {
    const updated = [...annotations, anno];
    commitState(images, overlaps, updated);
  };

  const handleUndo = () => {
    pendingCropRef.current = null;
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setImages(history[prevIdx].images);
      setOverlaps(history[prevIdx].overlaps);
      setAnnotations(history[prevIdx].annotations);
      setUncertainSeams([]);
    }
  };

  const handleRedo = () => {
    pendingCropRef.current = null;
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setImages(history[nextIdx].images);
      setOverlaps(history[nextIdx].overlaps);
      setAnnotations(history[nextIdx].annotations);
      setUncertainSeams([]);
    }
  };

  // Ctrl/Cmd+Z to undo; Ctrl/Cmd+Shift+Z or Ctrl+Y to redo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement &&
          target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey && historyIndex > 0) {
        event.preventDefault();
        handleUndo();
      } else if (((key === 'z' && event.shiftKey) || key === 'y') &&
                 historyIndex < history.length - 1) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history, historyIndex]);

  const handleClearAnnotations = () => {
    commitState(images, overlaps, []);
  };

  // --- Drag Adjustment Callbacks ---
  const handleAdjustOverlap = (idx: number, val: number) => {
    setUncertainSeams(prev => prev.filter(index => index !== idx));
    // Modify state in real-time for rendering smoothness (don't push history yet)
    setOverlaps(prev => {
      const updated = [...prev];
      updated[idx] = Math.max(0, val);
      return updated;
    });
  };

  const handleManualOverlapsChange = (newVals: number[]) => {
    const safe = clampOverlapsToVisibleImages(images, newVals, direction);
    setUncertainSeams(prev => prev.filter(idx => overlaps[idx] === safe[idx]));
    setOverlaps(safe);
  };

  // Drag state is kept synchronously so one pointer move never reads a stale
  // React render: the crop frame and stitched preview consume identical data.
  const pendingCropRef = useRef<{images: StitchedImage[]; overlaps: number[]} | null>(null);
  const handleAdjustCrop = (sliceIndex: number, field: 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight', val: number) => {
    imageChangeSequenceRef.current++;
    setIsStitching(false);
    const baseline = pendingCropRef.current?.images ?? images;
    const next = baseline.map((img, idx) => idx === sliceIndex
      ? { ...img, [field]: clampCropValue(img, field, val) } : img);
    const safeOverlaps = clampOverlapsToVisibleImages(next, pendingCropRef.current?.overlaps ?? overlaps, direction);
    pendingCropRef.current = {images: next, overlaps: safeOverlaps};
    setImages(next);
    setOverlaps(safeOverlaps);
    setUncertainSeams(prev => Array.from(new Set([
      ...prev, ...(sliceIndex > 0 ? [sliceIndex - 1] : []),
      ...(sliceIndex < next.length - 1 ? [sliceIndex] : [])
    ])).sort((a,b)=>a-b));
  };

  const handleResetOneCrop = (index: number) => {
    pendingCropRef.current = null;
    imageChangeSequenceRef.current++;
    const next = images.map((img, i) => i === index
      ? { ...img, cropTop:0, cropBottom:0, cropLeft:0, cropRight:0 } : img);
    commitState(next, clampOverlapsToVisibleImages(next, overlaps, direction), annotations);
    setUncertainSeams(prev => Array.from(new Set([
      ...prev, ...(index > 0 ? [index - 1] : []),
      ...(index < images.length - 1 ? [index] : [])
    ])).sort((a,b)=>a-b));
  };

  // Drag End pushes state to History
  const handleDragEnd = () => {
    const snapshot = pendingCropRef.current;
    pendingCropRef.current = null;
    commitState(snapshot?.images ?? images, snapshot?.overlaps ?? overlaps, annotations);
  };

  // --- Image Slice Split Callback (Cut Line) ---
  const handleSplitImage = (
    sliceIndex: number,
    relativeCoord: number,
    scale: number,
    type: 'horizontal' | 'vertical'
  ) => {
    const slice = images[sliceIndex];
    const minMargin = 20;

    let sliceA: StitchedImage;
    let sliceB: StitchedImage;

    if (type === 'horizontal') {
      const dyVisible = relativeCoord / scale;
      const splitPixel = Math.round(slice.cropTop + dyVisible);

      if (splitPixel <= slice.cropTop + minMargin || splitPixel >= slice.height - slice.cropBottom - minMargin) {
        alert("太靠近边缘了，无法切分！");
        return;
      }

      sliceA = {
        ...slice,
        id: crypto.randomUUID(),
        originalId: slice.originalId ?? slice.id,
        cropBottom: slice.height - splitPixel,
      };

      sliceB = {
        ...slice,
        id: crypto.randomUUID(),
        originalId: slice.originalId ?? slice.id,
        cropTop: splitPixel,
      };
    } else {
      const dxVisible = relativeCoord / scale;
      const splitPixel = Math.round(slice.cropLeft + dxVisible);

      if (splitPixel <= slice.cropLeft + minMargin || splitPixel >= slice.width - slice.cropRight - minMargin) {
        alert("太靠近边缘了，无法切分！");
        return;
      }

      sliceA = {
        ...slice,
        id: crypto.randomUUID(),
        originalId: slice.originalId ?? slice.id,
        cropRight: slice.width - splitPixel,
      };

      sliceB = {
        ...slice,
        id: crypto.randomUUID(),
        originalId: slice.originalId ?? slice.id,
        cropLeft: splitPixel,
      };
    }

    const updatedImages = [...images];
    updatedImages.splice(sliceIndex, 1, sliceA, sliceB);

    const updatedOverlaps = [...overlaps];
    updatedOverlaps.splice(sliceIndex, 0, 0); // Insert 0 overlap between the two splits

    commitState(updatedImages, updatedOverlaps, annotations);
    setUncertainSeams([]);
    setSelectedTool('select'); // Set tool back to select so they can drag to crop
  };

  // Reset cropping and collapse split slices without clearing annotations.
  const handleResetCropsAndSplits = () => {
    if (!images.length) return;
    const resetImages = restoreOriginalImages(images);
    commitState(resetImages, Array(Math.max(0, resetImages.length - 1)).fill(0), annotations);
    setUncertainSeams([]);
  };

  // --- Export / Download Actions ---
  // --- Export / Download Actions ---
  const getFormattedDateTime = () => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
  };

  const triggerDownload = (content: string | Blob, mimeType: string, filename: string) => {
    const isAndroidApp = (window as any).AndroidApp;

    if (content instanceof Blob) {
      if (isAndroidApp) {
        const reader = new FileReader();
        reader.onerror = () => console.error("无法读取要保存的文件");
        reader.onload = () => {
          if (typeof reader.result !== 'string') return;
          const base64 = reader.result.split(',')[1];
          if (!base64) return;
          try {
            (window as any).AndroidApp.saveBase64File(base64, mimeType, filename);
          } catch (e) {
            console.error("Native blob download failed", e);
          }
        };
        reader.readAsDataURL(content);
        return;
      }

      // Standard blob download
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } else {
      // Content is base64 dataUrl
      let base64 = content;
      if (content.startsWith('data:')) {
        base64 = content.split(',')[1];
      }

      if (isAndroidApp) {
        try {
          (window as any).AndroidApp.saveBase64File(base64, mimeType, filename);
          return;
        } catch (e) {
          console.error("Native base64 download failed", e);
        }
      }

      // Standard dataUrl download
      const a = document.createElement('a');
      a.href = `data:${mimeType};base64,${base64}`;
      a.download = filename;
      a.click();
    }
  };

  const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      try {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片编码失败')), mime, quality);
      } catch (error) { reject(error); }
    });

  const runExport = async (task: () => Promise<void>) => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setIsExporting(true);
    setCopyStatus('');
    try {
      await task();
    } catch (error) {
      console.error('Export error', error);
      setCopyStatus(error instanceof Error ? error.message : '导出失败，请重试');
    } finally {
      setIsExporting(false);
      exportInFlightRef.current = false;
    }
  };

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void runExport(async () => {
      const mime = exportConfig.format === 'png' ? 'image/png' : 'image/jpeg';
      triggerDownload(
        await canvasToBlob(canvas, mime, exportConfig.quality),
        mime,
        `Picsew_${getFormattedDateTime()}.${exportConfig.format}`
      );
    });
  };

  const handleCopyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      setCopyStatus('当前浏览器不支持复制图片，请使用下载功能。');
      return;
    }
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Canvas export failed')), 'image/png');
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('已复制 PNG 图片，可直接粘贴。');
    } catch (error) {
      console.error('Could not copy image', error);
      setCopyStatus('复制失败，请检查剪贴板权限或改用下载。');
    }
  };

  const handleShareImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!navigator.share || !navigator.canShare) {
      setCopyStatus('当前浏览器不支持直接分享图片，请先下载。');
      return;
    }
    void runExport(async () => {
      const blob = await canvasToBlob(canvas, 'image/png');
      const file = new File([blob], `Picsew_${getFormattedDateTime()}.png`, { type: 'image/png' });
      const shareData = { files: [file], title: 'Picsew 长截图' };
      if (!navigator.canShare(shareData)) {
        throw new Error('当前设备不支持分享此图片，请改用下载。');
      }
      try {
        await navigator.share(shareData);
      } catch (error) {
        // Closing the OS share sheet is a normal operation, not an export error.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        throw error;
      }
    });
  };

  const handleDownloadPDF = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void runExport(async () => {
      const plan = planPdfExport(canvas.width, canvas.height, exportConfig.pdfPageMode);
      if (plan.mode !== exportConfig.pdfPageMode) {
        setCopyStatus('单页 PDF 太长，已自动改为 A4 分页，避免截断。');
      }
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: plan.mode === 'single' ? [plan.widthPt, plan.heightPt] : 'a4'
      });
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      for (let i = 0; i < plan.count; i++) {
        const offsetY = i * plan.pageHeightPx;
        const height = Math.min(plan.pageHeightPx, canvas.height - offsetY);
        pageCanvas.height = height;
        const ctx = pageCanvas.getContext('2d');
        if (!ctx) throw new Error('无法创建 PDF 页面画布');
        ctx.drawImage(canvas, 0, offsetY, canvas.width, height, 0, 0, canvas.width, height);
        const jpeg = await canvasToBlob(pageCanvas, 'image/jpeg', 0.9);
        if (i > 0) pdf.addPage();
        pdf.addImage(new Uint8Array(await jpeg.arrayBuffer()), 'JPEG',
          0, 0, plan.widthPt, height / canvas.width * plan.widthPt);
      }
      triggerDownload(pdf.output('blob'), 'application/pdf',
        `Picsew_${getFormattedDateTime()}.pdf`);
    });
  };

  const handleDownloadZip = () => {
    const canvas = canvasRef.current;
    const sliceHeight = Math.floor(exportConfig.scale);
    if (!canvas || sliceHeight <= 0) return;
    void runExport(async () => {
      const parts = Math.ceil(canvas.height / sliceHeight);
      if (parts > 160) throw new Error(`需要 ${parts} 段切片，请增大高度；最多支持 160 段。`);
      const archive = new JSZip();
      const mime = exportConfig.format === 'png' ? 'image/png' : 'image/jpeg';
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      for (let i = 0; i < parts; i++) {
        const height = Math.min(sliceHeight, canvas.height - i * sliceHeight);
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) throw new Error('无法创建切片画布');
        ctx.drawImage(canvas, 0, i * sliceHeight, canvas.width, height,
          0, 0, canvas.width, height);
        archive.file(`slice_${String(i + 1).padStart(3, '0')}.${exportConfig.format}`,
          await canvasToBlob(tempCanvas, mime, exportConfig.quality));
      }
      const blob = await archive.generateAsync({
        type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 }
      });
      triggerDownload(blob, 'application/zip',
        `Picsew_slices_${getFormattedDateTime()}.zip`);
    });
  };

  const tools = [
    { id: 'upload', label: '素材', icon: Images },
    { id: 'stitch', label: '拼接', icon: WandSparkles },
    { id: 'cut', label: '裁剪', icon: PencilRuler },
    { id: 'mockup', label: '美化', icon: Sparkles },
    { id: 'export', label: '导出', icon: Download }
  ];
  const currentGroup = activeTab === 'cut' || activeTab === 'markup' ? 'cut'
    : activeTab === 'statusbar' || activeTab === 'mockup' || activeTab === 'watermark' ? 'mockup' : activeTab;
  const toolName = currentGroup === 'upload' ? '素材管理'
    : currentGroup === 'stitch' ? '拼接与对齐'
    : currentGroup === 'cut' ? '裁剪与标注'
    : currentGroup === 'mockup' ? '外观美化' : '保存与分享';

  const cropMode = panelOpen && activeTab === 'cut' && !advancedCutOpen;
  const previewCanvas = (
    <PreviewCanvas
                images={images}
                direction={direction}
                gap={gap}
                overlaps={overlaps}
                statusBar={statusBar}
                mockup={mockup}
                watermark={watermark}
                annotations={annotations}
                onAddAnnotation={handleAddAnnotation}
                selectedTool={selectedTool}
                activeTab={cropMode ? 'view' : panelOpen ? activeTab : 'view'}
      compact={cropMode}
      focusSliceIndex={cropMode ? Math.max(0, images.findIndex(img => img.id === cropSelectedId)) : undefined}
                color={color}
                strokeWidth={strokeWidth}
                fontSize={fontSize}
                canvasRef={canvasRef}
                onAdjustOverlap={handleAdjustOverlap}
                onAdjustCrop={handleAdjustCrop}
                onSplitImage={handleSplitImage}
                onDragEnd={handleDragEnd}
                onUndo={handleUndo}
                canUndo={historyIndex > 0}
                onResetAll={handleResetAll}
              />
  );

  return (
    <div className="workspace-app flex h-dvh w-screen flex-col overflow-hidden text-slate-800">
      <header className="workspace-header relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-3 md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="workspace-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="m-0 text-[16px] font-bold tracking-tight text-slate-900">Picsew Web</h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">轻松拼接每一张截图</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {uncertainSeams.length > 0 && (
            <button type="button" onClick={() => openTool('stitch')}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-50 border border-amber-200 px-2.5 py-2 text-xs font-semibold text-amber-800"
              title="打开拼接面板，检查无法自动对齐的连接位置">
              <AlertTriangle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{uncertainSeams.length} 处待检查</span><span className="sm:hidden">{uncertainSeams.length}</span>
            </button>
          )}
          {images.length > 0 && (
            <span className="workspace-count hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold sm:flex">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {images.length} 张图片
            </span>
          )}
          <button
            type="button"
            onClick={() => openTool('upload')}
            className="workspace-top-button flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">添加图片</span><span className="sm:hidden">添加</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={!images.length || isExporting}
            className="workspace-primary flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> 导出
          </button>
        </div>
      </header>

      <main className="workspace-main relative flex min-h-0 flex-1 flex-col">
        {images.length === 0 ? (
          <section className="workspace-welcome mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center justify-center px-5 pb-25 text-center">
            <div className="workspace-welcome-icon mb-5 flex h-17 w-17 items-center justify-center rounded-[24px]">
              <Images className="h-8 w-8 text-blue-600" />
            </div>
            <p className="mb-2 text-xs font-bold tracking-[0.18em] text-blue-600">一步开始</p>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 md:text-4xl">多张截图，一张长图</h2>
            <p className="mb-7 max-w-[380px] text-sm leading-6 text-slate-500">拖入截图即可自动对齐。裁剪、打码、设备外框与高清导出都在这里完成。</p>
            <div className="workspace-import-card w-full max-w-[450px] rounded-[26px] p-4 text-left">
              <ImageUploader
                images={images}
                onImagesChange={handleImagesChange}
                onAutoStitchTrigger={handleAutoStitch}
              />
            </div>
            <p className="mt-5 text-xs text-slate-400">图片仅在当前设备处理，不会上传到服务器</p>
          </section>
        ) : (
          <>
            {cropMode ? (
              <section className="crop-studio-shell" aria-label="可视化裁剪工作区">
                <div className="crop-studio-heading">
                  <div className="min-w-0">
                    <span className="crop-studio-eyebrow">PICSEW · VISUAL EDITOR</span>
                    <h2 className="text-lg font-bold tracking-tight text-slate-900 md:text-xl">自由裁剪</h2>
                    <p className="hidden text-xs text-slate-500 sm:block">左边裁剪当前截图，右边同步显示最终拼接画面。</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={handleUndo} disabled={historyIndex === 0}
                      className="crop-soft-btn px-3 py-2 text-xs font-semibold disabled:opacity-40">
                      撤销
                    </button>
                    <button type="button" onClick={() => setAdvancedCutOpen(true)}
                      className="crop-soft-btn px-3 py-2 text-xs font-semibold">高级分割</button>
                    <button type="button" onClick={closePanel}
                      className="crop-done-btn px-4 py-2.5 text-xs font-bold">
                      <Check className="h-4 w-4"/> 完成裁剪
                    </button>
                  </div>
                </div>
                <div className="crop-studio-grid">
                  <section className="crop-studio-panel crop-studio-editor-pane">
                    <ImageCropEditor images={images} selectedId={cropSelectedId}
                      onSelect={setCropSelectedId} onChange={handleAdjustCrop}
                      onCommit={handleDragEnd} onReset={handleResetOneCrop}/>
                  </section>
                  <section className="crop-studio-panel crop-studio-result-pane" aria-label="实时拼接预览">
                    <div className="crop-result-heading">
                      <div>
                        <span className="crop-studio-eyebrow">OUTPUT / 完整结果</span>
                        <h3 className="text-sm font-bold text-slate-800">实时拼接预览</h3>
                      </div>
                      <span className="crop-live-indicator"><span className="crop-live-dot"/> 实时更新</span>
                    </div>
                    <div className="crop-result-canvas">{previewCanvas}</div>
                    <div className="crop-result-caption">
                      <span>与下载内容使用同一画布</span>
                      <button type="button" onClick={handleAutoStitch} disabled={isStitching || images.length < 2}
                        className="font-semibold text-blue-600 disabled:opacity-40">
                        重新智能对齐
                      </button>
                    </div>
                  </section>
                </div>
              </section>
            ) : (
              <section className="workspace-canvas min-h-0 flex-1 px-2 pb-25 pt-2 md:px-6 md:pb-25">
                {previewCanvas}
              </section>
            )}
            {images.length > 1 && !panelOpen && (
              <button
                type="button"
                onClick={handleAutoStitch}
                className="workspace-auto absolute bottom-26 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold text-blue-700 shadow-md md:bottom-27"
              >
                <WandSparkles className="h-4 w-4" /> 重新智能对齐
              </button>
            )}
          </>
        )}

        {(isStitching || isExporting) && (
          <div className="workspace-processing absolute inset-0 z-60 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-semibold text-slate-700">
              {isStitching ? '正在智能对齐截图…' : '正在生成文件…'}
            </p>
          </div>
        )}

        {panelOpen && !cropMode && (
          <>
            <button
              type="button"
              aria-label="关闭工具面板"
              onClick={closePanel}
              className="workspace-backdrop absolute inset-0 z-30"
            />
            <aside className="workspace-sheet absolute z-40 flex flex-col overflow-hidden" aria-label={toolName}>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/60 px-5 py-4">
                <div>
                  <h2 className="text-[17px] font-bold text-slate-900">{advancedCutOpen ? '高级图片分割' : toolName}</h2>
                  {advancedCutOpen
                    ? <button type="button" onClick={() => setAdvancedCutOpen(false)}
                        className="mt-1 text-xs font-semibold text-blue-600">← 返回四边裁剪</button>
                    : <p className="mt-1 text-[11px] text-slate-500">按需调整，完成后点击空白处返回画布</p>}
                </div>
                <button type="button" aria-label="关闭面板" onClick={closePanel} className="workspace-icon-button rounded-xl p-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {(currentGroup === 'cut' || currentGroup === 'mockup') && (
                <div className="workspace-subtabs mx-4 mt-4 flex shrink-0 gap-1 rounded-xl p-1">
                  {(currentGroup === 'cut'
                    ? [{ id: 'cut', label: '裁剪' }, { id: 'markup', label: '标注与打码' }]
                    : [{ id: 'mockup', label: '设备套壳' }, { id: 'statusbar', label: '状态栏' }, { id: 'watermark', label: '文字水印' }]
                  ).map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setSelectedTool(item.id === 'markup' ? 'pen' : 'select');
                      }}
                      className={activeTab === item.id ? 'workspace-subtab active' : 'workspace-subtab'}
                    >{item.label}</button>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                <ControlPanel
                  hideTabNavigation
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  direction={direction}
                  setDirection={handleDirectionChange}
                  gap={gap}
                  setGap={setGap}
                  overlaps={overlaps}
                  setOverlaps={handleManualOverlapsChange}
                  uncertainSeams={uncertainSeams}
                  imageNames={images.map(img => img.name)}
                  selectedTool={selectedTool}
                  setSelectedTool={setSelectedTool}
                  color={color}
                  setColor={setColor}
                  strokeWidth={strokeWidth}
                  setStrokeWidth={setStrokeWidth}
                  fontSize={fontSize}
                  setFontSize={setFontSize}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onClearAnnotations={handleClearAnnotations}
                  canUndo={historyIndex > 0}
                  canRedo={historyIndex < history.length - 1}
                  statusBar={statusBar}
                  setStatusBar={setStatusBar}
                  mockup={mockup}
                  setMockup={setMockup}
                  watermark={watermark}
                  setWatermark={setWatermark}
                  exportConfig={exportConfig}
                  setExportConfig={setExportConfig}
                  onDownloadImage={handleDownloadImage}
                  onCopyImage={handleCopyImage}
                  onShareImage={handleShareImage}
                  copyStatus={copyStatus}
                  onDownloadPDF={handleDownloadPDF}
                  onDownloadZip={handleDownloadZip}
                  hasImages={images.length > 0}
                  onResetCropsAndSplits={handleResetCropsAndSplits}
                  isMobile={isMobile}
                  images={images}
                  onImagesChange={handleImagesChange}
                  onAutoStitchTrigger={handleAutoStitch}
                />
              </div>
              <div className="workspace-sheet-footer shrink-0 px-5 py-3 text-xs text-slate-400">
                <ChevronRight className="mr-1 inline h-3 w-3" /> 所有调整实时显示在画布中
              </div>
            </aside>
          </>
        )}

        <nav className="workspace-dock absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-[22px] p-1.5" aria-label="主要工具">
          {tools.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => openTool(tool.id)}
                aria-pressed={panelOpen && currentGroup === tool.id}
                className={panelOpen && currentGroup === tool.id ? 'workspace-dock-item active' : 'workspace-dock-item'}
              >
                <Icon className="h-[19px] w-[19px]" />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </nav>
      </main>
    </div>
  );
}

export default App;
