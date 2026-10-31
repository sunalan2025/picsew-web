import { useState, useRef, useEffect } from 'react';
import {
  Smartphone, Grid, RefreshCw, Layers
} from 'lucide-react';
import type {
  StitchedImage,
  Annotation,
  AnnotationType,
  StatusBarConfig,
  MockupConfig,
  ExportConfig
} from './types';
import { ImageUploader } from './components/ImageUploader';
import { ControlPanel } from './components/ControlPanel';
import { PreviewCanvas } from './components/PreviewCanvas';
import { detectOverlap, loadImage } from './utils/stitching';
import { restoreOriginalImages } from './utils/imageState';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

interface HistoryState {
  images: StitchedImage[];
  overlaps: number[];
  annotations: Annotation[];
}

function App() {
  // Images/Slices list
  const [images, setImages] = useState<StitchedImage[]>([]);
  // Overlaps between adjacent slices
  const [overlaps, setOverlaps] = useState<number[]>([]);
  
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
  const [activeTab, setActiveTab] = useState<string>(window.innerWidth < 768 ? 'upload' : 'stitch');

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
      setSelectedTool('select');
    }
  };

  // Keep manually adjusted overlaps only while the same two images remain adjacent.
  // Reorder/removal must not inherit an overlap from a different image pair.
  const handleImagesChange = async (newImgs: StitchedImage[]) => {
    const sequence = ++imageChangeSequenceRef.current;
    const previousPairs = new Map<string, number>();
    for (let i = 0; i < images.length - 1; i++) {
      previousPairs.set(`${images[i].id}:${images[i + 1].id}`, overlaps[i] ?? 0);
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
    for (let i = 0; i < newImgs.length - 1; i++) {
      const pair = `${newImgs[i].id}:${newImgs[i + 1].id}`;
      if (previousPairs.has(pair)) {
        newOverlaps.push(previousPairs.get(pair)!);
        continue;
      }

      try {
        const [first, second] = await Promise.all([
          getDecoded(newImgs[i]),
          getDecoded(newImgs[i + 1])
        ]);
        newOverlaps.push(detectOverlap(first, second));
      } catch (error) {
        console.error('Error calculating overlap', error);
        newOverlaps.push(0);
      }
      if (sequence !== imageChangeSequenceRef.current) return;
    }

    if (sequence !== imageChangeSequenceRef.current) return;
    commitState(newImgs, newOverlaps, annotations);
  };

  // --- Auto Stitching Logic ---
  const handleAutoStitch = async () => {
    if (images.length < 2) return;
    setIsStitching(true);
    
    try {
      const newOverlaps: number[] = [];
      let previousImage: HTMLImageElement | null = null;
      for (let i = 0; i < images.length - 1; i++) {
        const imgA: HTMLImageElement = previousImage ?? await loadImage(images[i].src);
        const imgB = await loadImage(images[i + 1].src);
        newOverlaps.push(detectOverlap(imgA, imgB));
        previousImage = imgB;
      }
      
      // Reset crops of all images when smart-stitching
      const resetImages = images.map(img => ({
        ...img,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0
      }));

      commitState(resetImages, newOverlaps, annotations);
      setDirection('vertical');
      setActiveTab('stitch');
    } catch (err) {
      console.error('Error during auto stitching', err);
      alert('自动拼接算法出错，请尝试拖动手动微调！');
    } finally {
      setIsStitching(false);
    }
  };

  // --- Drawing History / Undo-Redo Stack ---
  const handleAddAnnotation = (anno: Annotation) => {
    const updated = [...annotations, anno];
    commitState(images, overlaps, updated);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setImages(history[prevIdx].images);
      setOverlaps(history[prevIdx].overlaps);
      setAnnotations(history[prevIdx].annotations);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setImages(history[nextIdx].images);
      setOverlaps(history[nextIdx].overlaps);
      setAnnotations(history[nextIdx].annotations);
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
    // Modify state in real-time for rendering smoothness (don't push history yet)
    setOverlaps(prev => {
      const updated = [...prev];
      updated[idx] = Math.max(0, val);
      return updated;
    });
  };

  const handleAdjustCrop = (sliceIndex: number, field: 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight', val: number) => {
    // Modify crop state in real-time
    setImages(prev => prev.map((img, idx) => {
      if (idx === sliceIndex) {
        return { ...img, [field]: val };
      }
      return img;
    }));
  };

  // Drag End pushes state to History
  const handleDragEnd = () => {
    commitState(images, overlaps, annotations);
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
    setSelectedTool('select'); // Set tool back to select so they can drag to crop
  };

  // Reset cropping and collapse split slices without clearing annotations.
  const handleResetCropsAndSplits = () => {
    if (!images.length) return;
    const resetImages = restoreOriginalImages(images);
    commitState(resetImages, Array(Math.max(0, resetImages.length - 1)).fill(0), annotations);
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
      setTimeout(() => URL.revokeObjectURL(url), 100);
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

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mime = exportConfig.format === 'png' ? 'image/png' : 'image/jpeg';
    const filename = `Picsew_${getFormattedDateTime()}.${exportConfig.format}`;
    const dataUrl = canvas.toDataURL(mime, exportConfig.quality);

    triggerDownload(dataUrl, mime, filename);
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

  const handleDownloadPDF = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const a4W = 595.28;
    const a4H = 841.89;

    const canvasRatio = canvas.height / canvas.width;
    const scaledHeight = a4W * canvasRatio;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const filename = exportConfig.pdfPageMode === 'single'
      ? `Picsew_${getFormattedDateTime()}.pdf`
      : `Picsew_paginated_${getFormattedDateTime()}.pdf`;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: exportConfig.pdfPageMode === 'single' ? [a4W, scaledHeight] : 'a4'
    });

    if (exportConfig.pdfPageMode === 'single') {
      pdf.addImage(dataUrl, 'JPEG', 0, 0, a4W, scaledHeight);
    } else {
      const pagesCount = Math.ceil(scaledHeight / a4H);
      for (let i = 0; i < pagesCount; i++) {
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, -i * a4H, a4W, scaledHeight);
      }
    }

    const pdfBlob = pdf.output('blob');
    triggerDownload(pdfBlob, 'application/pdf', filename);
  };

  const handleDownloadZip = async () => {
    const canvas = canvasRef.current;
    const sliceH = Math.floor(exportConfig.scale);
    if (!canvas || sliceH <= 0) return;

    const zip = new JSZip();
    const totalH = canvas.height;
    const totalW = canvas.width;
    const slicesCount = Math.ceil(totalH / sliceH);

    // SECURITY: Limit maximum slices to prevent browser crash / DoS
    if (slicesCount > 500) {
      alert(`切片数量过多 (${slicesCount} > 500)，请增加切片高度以防止浏览器崩溃 (Too many slices, please increase slice height)`);
      return;
    }

    const mime = exportConfig.format === 'png' ? 'image/png' : 'image/jpeg';
    const ext = exportConfig.format;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

    if (tempCtx) {
      for (let i = 0; i < slicesCount; i++) {
        const currentSliceH = Math.min(sliceH, totalH - i * sliceH);

        let resized = false;
        if (tempCanvas.width !== totalW) { tempCanvas.width = totalW; resized = true; }
        if (tempCanvas.height !== currentSliceH) { tempCanvas.height = currentSliceH; resized = true; }
        if (!resized) tempCtx.clearRect(0, 0, totalW, currentSliceH);

        tempCtx.drawImage(
          canvas,
          0, i * sliceH, totalW, currentSliceH,
          0, 0, totalW, currentSliceH
        );

        const sliceDataUrl = tempCanvas.toDataURL(mime, exportConfig.quality);
        const base64Data = sliceDataUrl.split(',')[1];
        zip.file(`slice_${i + 1}.${ext}`, base64Data, { base64: true });
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipBlob, 'application/zip', `Picsew_slices_${getFormattedDateTime()}.zip`);
  };

  return (
    <div className="flex flex-col h-dvh w-screen overflow-hidden bg-dark-950 text-gray-100 font-sans">
      {/* Header Bar */}
      <header className="shrink-0 bg-dark-900/80 border-b border-dark-800 backdrop-blur-md px-4 md:px-6 py-3 md:py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="bg-linear-to-tr from-primary-600 to-primary-400 p-1.5 md:p-2 rounded-xl text-white shadow-md shadow-primary-500/20">
            <Smartphone className="w-4 md:w-5 h-4 md:h-5" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold tracking-tight text-white m-0 leading-none">
              Picsew Web
            </h1>
            {!isMobile && <p className="text-[10px] text-gray-400 mt-1">智能截图拼接、状态栏美化、高清扩展套壳与分段切片工具</p>}
          </div>
        </div>

        {/* Info badges */}
        <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs text-gray-400 font-medium">
          <button
            onClick={() => setDirection(d => d === 'vertical' ? 'horizontal' : 'vertical')}
            className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700/60 rounded-xl font-semibold text-gray-300 hover:text-white transition cursor-pointer select-none"
            title="点击切换画布模式"
          >
            <Grid className="w-3.5 h-3.5 text-primary-400" />
            <span>画布: {direction === 'vertical' ? '纵向' : '横向'}</span>
          </button>
          <span className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 bg-dark-800/40 border border-dark-700/20 rounded-xl">
            <Layers className="w-3.5 h-3.5 text-pink-400" />
            <span>素材: {images.length} 张</span>
          </span>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className={`flex-1 flex overflow-hidden min-h-0 bg-linear-to-b from-dark-950 to-dark-900 ${isMobile ? 'flex-col' : 'flex-row'}`}>
        {/* Left Side: Images uploading & ordering (Desktop only) */}
        {!isMobile && (
          <section className="w-[300px] border-r border-dark-800 bg-dark-900/30 flex flex-col p-4 shrink-0 overflow-hidden">
            <h2 className="text-xs font-bold text-gray-400 mb-3 tracking-wider uppercase shrink-0">素材与排序</h2>
            <div className="flex-1 overflow-hidden">
              <ImageUploader
                images={images}
                onImagesChange={handleImagesChange}
                onAutoStitchTrigger={handleAutoStitch}
              />
            </div>
          </section>
        )}

        {/* Center: Canvas Live-Preview Area */}
        <section className="flex-1 flex flex-col items-center justify-center p-3 md:p-4 relative overflow-hidden bg-dark-950/80 min-h-0">
          {isStitching && (
            <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-xs flex flex-col items-center justify-center z-50 animate-fade-in">
              <RefreshCw className="w-10 h-10 text-primary-400 animate-spin mb-4" />
              <p className="text-sm font-semibold text-gray-200">正在分析图像像素特征，智能重合对齐中...</p>
              <p className="text-xs text-gray-500 mt-1">这通常只需几秒钟</p>
            </div>
          )}
          
          <div className="w-full h-full flex items-center justify-center relative">
            <PreviewCanvas
              images={images}
              direction={direction}
              gap={gap}
              overlaps={overlaps}
              statusBar={statusBar}
              mockup={mockup}
              annotations={annotations}
              onAddAnnotation={handleAddAnnotation}
              selectedTool={selectedTool}
              activeTab={activeTab}
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
          </div>
        </section>

        {/* Right/Bottom Side: Options Controls Panels */}
        <section className={`${isMobile ? 'w-full h-[45vh] border-t' : 'w-[340px] border-l'} border-dark-800 bg-dark-900/30 flex flex-col shrink-0 overflow-hidden`}>
          {!isMobile && <h2 className="text-xs font-bold text-gray-400 p-4 pb-0 tracking-wider uppercase shrink-0">控制面板</h2>}
          <div className="flex-1 overflow-hidden">
            <ControlPanel
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              direction={direction}
              setDirection={setDirection}
              gap={gap}
              setGap={setGap}
              overlaps={overlaps}
              setOverlaps={setOverlaps}
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
              exportConfig={exportConfig}
              setExportConfig={setExportConfig}
              onDownloadImage={handleDownloadImage}
              onCopyImage={handleCopyImage}
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
        </section>
      </main>
    </div>
  );
}

export default App;
