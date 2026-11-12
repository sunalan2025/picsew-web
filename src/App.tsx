import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Smartphone,
  RefreshCw,
  Images,
  WandSparkles,
  PencilRuler,
  AlertTriangle,
  Sparkles,
  Download,
  Plus,
  X,
  Check,
} from 'lucide-react';
import type { StitchedImage, Annotation, AnnotationType } from './types';
import { QuickStart } from './components/QuickStart';
import { createExampleFiles } from './utils/exampleImages';
import { ImageUploader } from './components/ImageUploader';
import { ControlPanel } from './components/ControlPanel';
import { ImageCropEditor } from './components/ImageCropEditor';
import { PreviewCanvas } from './components/PreviewCanvas';
import {
  detectOverlapAsync,
  loadImage,
  visibleImageSource,
} from './utils/stitching';
import {
  clampCropValue,
  clampOverlapsToVisibleImages,
  restoreOriginalImages,
} from './utils/imageState';
import {
  readIncomingShare,
  acknowledgeIncomingShare,
} from './utils/incomingShare';
import { useDraft } from './hooks/useDraft';
import { useAppUpdate } from './hooks/useAppUpdate';
import { useEditorProject } from './hooks/useEditorProject';
import { renderProject, exportSource } from './utils/renderProject';
import { anchorAnnotation } from './utils/annotations';
import { getStitchedLayout } from './utils/imageState';
import { commonEdgeBands } from './utils/fixedBars';
import { downloadBlob } from './utils/download';
import { planPdfExport } from './utils/pdfExport';

function App() {
  const {
    images,
    overlaps,
    annotations,
    direction,
    gap,
    statusBar,
    mockup,
    watermark,
    exportConfig,
    setImages,
    setOverlaps,
    setAnnotations,
    setDirection,
    setGap,
    setStatusBar,
    setMockup,
    setWatermark,
    setExportConfig,
    project,
    restoreProject,
    commitState,
    replaceState,
    undo,
    redo,
    history,
    historyIndex,
  } = useEditorProject();
  const [isExample, setIsExample] = useState(false);
  const [isPreparingExample, setIsPreparingExample] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const draft = useDraft(
    project,
    (next) => {
      // Restoration is a project command: invalidate any older import/alignment result.
      imageChangeSequenceRef.current++;
      pendingCropRef.current = null;
      pendingOverlapRef.current = null;
      setIsStitching(false);
      setUncertainSeams([]);
      setFocusedSeam(null);
      setSelectedAnnotationId(null);
      setIsExample(false);
      restoreProject(next);
    },
    !isExample
  );
  const appUpdate = useAppUpdate(draft.saveForReload);
  const [incomingShare, setIncomingShare] = useState<{
    id: string;
    files: File[];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    readIncomingShare()
      .then((share) => {
        if (alive && share) {
          setIncomingShare(share);
          setActiveTab('upload');
          setPanelOpen(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const consumeShare = () => {
    if (!incomingShare) return;
    if (incomingShare.id === 'native') {
      (
        window as unknown as { AndroidApp?: { finishSharedImport: () => void } }
      ).AndroidApp?.finishSharedImport();
      setIncomingShare(null);
    } else if (incomingShare.id)
      void acknowledgeIncomingShare(incomingShare.id).then(() =>
        setIncomingShare(null)
      );
    else setIncomingShare(null);
  };
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,[contenteditable="true"]')
      )
        return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length) {
        event.preventDefault();
        setIncomingShare({ id: '', files });
        setActiveTab('upload');
        setPanelOpen(true);
      }
    };
    const native = async () => {
      const bridge = (
        window as unknown as {
          AndroidApp?: {
            listSharedImages?: () => string;
            readSharedImage: (i: number) => string;
          };
        }
      ).AndroidApp;
      if (!bridge?.listSharedImages) return;
      try {
        const entries = JSON.parse(bridge.listSharedImages()) as {
          index: number;
          mime: string;
        }[];
        const files: File[] = [];
        let sharedBytes = 0;
        for (const entry of entries) {
          const data = bridge.readSharedImage(entry.index);
          if (!data)
            throw new Error('分享图片过大或无法读取，请从素材页手动导入');
          const blob = await (
            await fetch(`data:${entry.mime};base64,${data}`)
          ).blob();
          sharedBytes += blob.size;
          if (sharedBytes > 48 * 1024 * 1024)
            throw new Error('分享图片总量过大，请分批导入');
          files.push(
            new File(
              [blob],
              `shared-${entry.index + 1}.${entry.mime.split('/')[1] || 'png'}`,
              { type: entry.mime }
            )
          );
        }
        if (files.length) {
          setIncomingShare({ id: 'native', files });
          setActiveTab('upload');
          setPanelOpen(true);
        }
      } catch (error) {
        setCopyStatus(
          error instanceof Error ? error.message : '无法读取系统分享'
        );
      }
    };
    window.addEventListener('paste', paste);
    window.addEventListener('picsew-share-ready', native);
    void native();
    return () => {
      window.removeEventListener('paste', paste);
      window.removeEventListener('picsew-share-ready', native);
    };
  }, []);
  const [barSuggestion, setBarSuggestion] = useState<{
    top: number;
    bottom: number;
  } | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [cropSelectedId, setCropSelectedId] = useState<string | null>(null);
  const [advancedCutOpen, setAdvancedCutOpen] = useState(false);
  // Overlaps between adjacent slices
  // A low-confidence join must be highlighted for review, never silently trimmed.
  const [uncertainSeams, setUncertainSeams] = useState<number[]>([]);
  const [focusedSeam, setFocusedSeam] = useState<{
    index: number;
    token: number;
  } | null>(null);
  const seamNavigationSequence = useRef(0);

  // Stitching process states
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
  const [selectedTool, setSelectedTool] = useState<
    AnnotationType | 'select' | 'cut-horizontal' | 'cut-vertical'
  >('select');
  const [color, setColor] = useState<string>('#ff3b30'); // Red
  const [strokeWidth, setStrokeWidth] = useState<number>(5);
  const [fontSize, setFontSize] = useState<number>(24);

  const pendingOverlapRef = useRef<number[] | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const showImportMessage = useCallback((message: string) => {
    setCopyStatus(message);
    setExportFailed(false);
  }, []);
  const [isExporting, setIsExporting] = useState(false);
  const exportInFlightRef = useRef(false);
  // Canvas Reference to fetch rendered bitmap
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Ignore the results of an older asynchronous image list change.
  const imageChangeSequenceRef = useRef(0);

  // Reset independently of the bounded undo history.
  const handleResetAll = () => {
    if (!images.length) return;
    if (window.confirm('确定要重置全部裁剪、分割、重合度和标注吗？')) {
      imageChangeSequenceRef.current++;
      pendingOverlapRef.current = null;
      setIsStitching(false);
      const resetImages = restoreOriginalImages(images);
      commitState(
        resetImages,
        Array(Math.max(0, resetImages.length - 1)).fill(0),
        []
      );
      setUncertainSeams([]);
      setSelectedTool('select');
    }
  };

  // Keep manually adjusted overlaps only while the same two images remain adjacent.
  // Reorder/removal must not inherit an overlap from a different image pair.
  const handleImagesChange = async (newImgs: StitchedImage[]) => {
    const sequence = ++imageChangeSequenceRef.current;
    const previousPairs = new Map<
      string,
      { pixels: number; review: boolean }
    >();
    for (let i = 0; i < images.length - 1; i++) {
      previousPairs.set(`${images[i].id}:${images[i + 1].id}`, {
        pixels: overlaps[i] ?? 0,
        review: uncertainSeams.includes(i),
      });
    }

    const decodedImages = new Map<string, HTMLImageElement>();
    const getDecoded = async (
      img: StitchedImage
    ): Promise<HTMLImageElement> => {
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
          getDecoded(newImgs[i + 1]),
        ]);
        const match = await detectOverlapAsync(
          visibleImageSource(first, newImgs[i]),
          visibleImageSource(second, newImgs[i + 1]),
          undefined,
          direction
        );
        newOverlaps.push(match.overlap);
        if (match.confidence !== 'high') newWarnings.push(i);
      } catch (error) {
        console.error('Error calculating overlap', error);
        newOverlaps.push(0);
        newWarnings.push(i);
      }
      if (sequence !== imageChangeSequenceRef.current) return false;
    }

    if (sequence !== imageChangeSequenceRef.current) return false;
    commitState(
      newImgs,
      clampOverlapsToVisibleImages(newImgs, newOverlaps, direction),
      annotations
    );
    setUncertainSeams(newWarnings);
    // Importing a new batch immediately returns to the finished canvas.
    if (newImgs.length > images.length) {
      setActiveTab('stitch');
      setPanelOpen(false);
      setSelectedTool('select');
    }
    return true;
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
        const imgA: HTMLImageElement =
          previousImage ?? (await loadImage(images[i].src));
        const imgB = await loadImage(images[i + 1].src);
        const match = await detectOverlapAsync(
          visibleImageSource(imgA, images[i]),
          visibleImageSource(imgB, images[i + 1]),
          undefined,
          direction
        );
        if (imageChangeSequenceRef.current !== sequence) return;
        newOverlaps.push(match.overlap);
        if (match.confidence !== 'high') warnings.push(i);
        previousImage = imgB;
      }

      if (imageChangeSequenceRef.current !== sequence) return;
      // Automatic alignment must not unexpectedly erase manual cropping.
      commitState(
        images,
        clampOverlapsToVisibleImages(images, newOverlaps, direction),
        annotations
      );
      setUncertainSeams(warnings);
      setActiveTab('stitch');
    } catch (err) {
      console.error('Error during auto stitching', err);
      setCopyStatus(
        '自动拼接暂时没有完成，图片仍在。可以再次尝试，或点击“检查拼接”手动确认连接处。'
      );
    } finally {
      if (imageChangeSequenceRef.current === sequence) setIsStitching(false);
    }
  };

  const handleDirectionChange = async (
    nextDirection: 'vertical' | 'horizontal'
  ) => {
    if (nextDirection === direction) return;
    const sequence = ++imageChangeSequenceRef.current;
    setDirection(nextDirection);
    // Old seam values belong to a different axis; never reuse them.
    commitState(
      images,
      Array(Math.max(0, images.length - 1)).fill(0),
      annotations
    );
    setUncertainSeams([]);
    if (images.length < 2) return;
    setIsStitching(true);
    try {
      const detected: number[] = [];
      const warnings: number[] = [];
      let previous: HTMLImageElement | null = null;
      for (let i = 0; i < images.length - 1; i++) {
        const first: HTMLImageElement =
          previous ?? (await loadImage(images[i].src));
        const second = await loadImage(images[i + 1].src);
        const match = await detectOverlapAsync(
          visibleImageSource(first, images[i]),
          visibleImageSource(second, images[i + 1]),
          undefined,
          nextDirection
        );
        if (imageChangeSequenceRef.current !== sequence) return;
        detected.push(match.overlap);
        if (match.confidence !== 'high') warnings.push(i);
        previous = second;
      }
      if (imageChangeSequenceRef.current !== sequence) return;
      replaceState(
        images,
        clampOverlapsToVisibleImages(images, detected, nextDirection),
        annotations
      );
      setUncertainSeams(warnings);
    } catch (error) {
      console.error(
        'Cannot recalculate overlap after switching direction',
        error
      );
    } finally {
      if (imageChangeSequenceRef.current === sequence) setIsStitching(false);
    }
  };

  const detectBars = async () => {
    try {
      const samples = [];
      for (const image of images.slice(0, 4)) {
        const source = await loadImage(image.src),
          canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 240;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(source, 0, 0, 48, 240);
        samples.push(ctx.getImageData(0, 0, 48, 240).data);
        source.src = '';
      }
      const bands = commonEdgeBands(samples, 48, 240);
      setBarSuggestion(bands);
    } catch {
      setCopyStatus('无法读取顶栏样本，请手动裁剪');
    }
  };
  const applyBars = () => {
    if (!barSuggestion) return;
    const next = images.map((image) => ({
      ...image,
      cropTop: clampCropValue(
        image,
        'cropTop',
        Math.max(image.cropTop, Math.round(image.height * barSuggestion.top))
      ),
      cropBottom: clampCropValue(
        image,
        'cropBottom',
        Math.max(
          image.cropBottom,
          Math.round(image.height * barSuggestion.bottom)
        )
      ),
    }));
    commitState(
      next,
      clampOverlapsToVisibleImages(next, overlaps, direction),
      annotations
    );
    setUncertainSeams(next.slice(1).map((_, i) => i));
    setBarSuggestion(null);
  };

  const rematchSeam = async (index: number) => {
    if (!images[index + 1]) return;
    const sequence = ++imageChangeSequenceRef.current;
    setIsStitching(true);
    try {
      const [a, b] = await Promise.all([
        loadImage(images[index].src),
        loadImage(images[index + 1].src),
      ]);
      const match = await detectOverlapAsync(
        visibleImageSource(a, images[index]),
        visibleImageSource(b, images[index + 1]),
        undefined,
        direction
      );
      if (sequence !== imageChangeSequenceRef.current) return;
      const next = [...overlaps];
      next[index] = match.overlap;
      commitState(
        images,
        clampOverlapsToVisibleImages(images, next, direction),
        annotations
      );
      setUncertainSeams((prev) =>
        match.confidence === 'high'
          ? prev.filter((i) => i !== index)
          : Array.from(new Set([...prev, index]))
      );
    } catch {
      setCopyStatus('这处接缝无法自动匹配，请手动精调');
    } finally {
      if (sequence === imageChangeSequenceRef.current) setIsStitching(false);
    }
  };

  const inspectSeam = (index: number) => {
    if (index < 0 || index >= images.length - 1) return;
    setPanelOpen(true);
    setAdvancedCutOpen(false);
    setSelectedTool('select');
    setActiveTab('stitch');
    setFocusedSeam({ index, token: ++seamNavigationSequence.current });
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
    const updated = [
      ...annotations,
      ...anchorAnnotation(
        anno,
        getStitchedLayout(images, overlaps, gap, direction).placements
      ),
    ];
    commitState(images, overlaps, updated);
  };

  const handleUndo = () => {
    pendingCropRef.current = null;
    pendingOverlapRef.current = null;
    imageChangeSequenceRef.current++;
    setIsStitching(false);
    undo();
    setUncertainSeams([]);
  };

  const handleRedo = () => {
    pendingCropRef.current = null;
    pendingOverlapRef.current = null;
    imageChangeSequenceRef.current++;
    setIsStitching(false);
    redo();
    setUncertainSeams([]);
  };

  const keyboardActions = useRef({ undo: handleUndo, redo: handleRedo });
  keyboardActions.current = { undo: handleUndo, redo: handleRedo };
  // Ctrl/Cmd+Z to undo; Ctrl/Cmd+Shift+Z or Ctrl+Y to redo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey && historyIndex > 0) {
        event.preventDefault();
        keyboardActions.current.undo();
      } else if (
        ((key === 'z' && event.shiftKey) || key === 'y') &&
        historyIndex < history.length - 1
      ) {
        event.preventDefault();
        keyboardActions.current.redo();
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
    setUncertainSeams((prev) => prev.filter((index) => index !== idx));
    setOverlaps((prev) => {
      const updated = [...prev];
      updated[idx] = val;
      return clampOverlapsToVisibleImages(images, updated, direction);
    });
  };

  const handleManualOverlapsChange = (newVals: number[]) => {
    const safe = clampOverlapsToVisibleImages(images, newVals, direction);
    pendingOverlapRef.current = safe;
    setUncertainSeams((prev) =>
      prev.filter((idx) => overlaps[idx] === safe[idx])
    );
    setOverlaps(safe);
  };
  const handleManualOverlapCommit = () => {
    const accepted = pendingOverlapRef.current;
    if (!accepted) return;
    pendingOverlapRef.current = null;
    commitState(images, accepted, annotations);
  };

  const pendingCropRef = useRef<{
    images: StitchedImage[];
    overlaps: number[];
  } | null>(null);
  const handleAdjustCrop = (
    sliceIndex: number,
    field: 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight',
    val: number
  ) => {
    imageChangeSequenceRef.current++;
    setIsStitching(false);
    const baseline = pendingCropRef.current?.images ?? images;
    const next = baseline.map((img, idx) =>
      idx === sliceIndex
        ? { ...img, [field]: clampCropValue(img, field, val) }
        : img
    );
    const safeOverlaps = clampOverlapsToVisibleImages(
      next,
      pendingCropRef.current?.overlaps ?? overlaps,
      direction
    );
    pendingCropRef.current = { images: next, overlaps: safeOverlaps };
    setImages(next);
    setOverlaps(safeOverlaps);
    setUncertainSeams((prev) =>
      Array.from(
        new Set([
          ...prev,
          ...(sliceIndex > 0 ? [sliceIndex - 1] : []),
          ...(sliceIndex < next.length - 1 ? [sliceIndex] : []),
        ])
      ).sort((a, b) => a - b)
    );
  };

  const handleResetOneCrop = (index: number) => {
    pendingCropRef.current = null;
    imageChangeSequenceRef.current++;
    const next = images.map((img, i) =>
      i === index
        ? { ...img, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 }
        : img
    );
    commitState(
      next,
      clampOverlapsToVisibleImages(next, overlaps, direction),
      annotations
    );
    setUncertainSeams((prev) =>
      Array.from(
        new Set([
          ...prev,
          ...(index > 0 ? [index - 1] : []),
          ...(index < images.length - 1 ? [index] : []),
        ])
      ).sort((a, b) => a - b)
    );
  };

  // Drag End pushes state to History
  const handleDragEnd = () => {
    const snapshot = pendingCropRef.current;
    pendingCropRef.current = null;
    commitState(
      snapshot?.images ?? images,
      snapshot?.overlaps ?? overlaps,
      annotations
    );
  };

  // --- Image Slice Split Callback (Cut Line) ---
  const handleSplitImage = (
    sliceIndex: number,
    relativeCoord: number,
    scale: number,
    type: 'horizontal' | 'vertical'
  ) => {
    imageChangeSequenceRef.current++;
    pendingOverlapRef.current = null;
    setIsStitching(false);
    const slice = images[sliceIndex];
    const minMargin = 20;

    let sliceA: StitchedImage;
    let sliceB: StitchedImage;

    if (type === 'horizontal') {
      const dyVisible = relativeCoord / scale;
      const splitPixel = Math.round(slice.cropTop + dyVisible);

      if (
        splitPixel <= slice.cropTop + minMargin ||
        splitPixel >= slice.height - slice.cropBottom - minMargin
      ) {
        alert('太靠近边缘了，无法切分！');
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

      if (
        splitPixel <= slice.cropLeft + minMargin ||
        splitPixel >= slice.width - slice.cropRight - minMargin
      ) {
        alert('太靠近边缘了，无法切分！');
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
    imageChangeSequenceRef.current++;
    pendingOverlapRef.current = null;
    setIsStitching(false);
    const resetImages = restoreOriginalImages(images);
    commitState(
      resetImages,
      Array(Math.max(0, resetImages.length - 1)).fill(0),
      annotations
    );
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

  const triggerDownload = downloadBlob;

  const canvasToBlob = (
    canvas: HTMLCanvasElement,
    mime: string,
    quality?: number
  ): Promise<Blob> =>
    new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('图片编码失败'))),
          mime,
          quality
        );
      } catch (error) {
        reject(error);
      }
    });

  const runExport = async (task: () => Promise<void>) => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setIsExporting(true);
    setCopyStatus('');
    setExportFailed(false);
    try {
      await task();
    } catch (error) {
      console.error('Export error', error);
      setExportFailed(
        !(error instanceof DOMException && error.name === 'AbortError')
      );
      setCopyStatus(
        error instanceof DOMException && error.name === 'AbortError'
          ? '已取消保存'
          : error instanceof Error
            ? error.message
            : '导出失败，请重试'
      );
    } finally {
      setIsExporting(false);
      exportInFlightRef.current = false;
    }
  };

  const handleDownloadImage = () => {
    if (!images.length) return;
    void runExport(async () => {
      const canvas = await renderProject(project);
      const mime = exportConfig.format === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(canvas, mime, exportConfig.quality);
      const result = await triggerDownload(
        blob,
        mime,
        `Picsew_${getFormattedDateTime()}.${exportConfig.format}`
      );
      setCopyStatus(
        `${result} · ${canvas.width} × ${canvas.height} px · ${(blob.size / 1024 / 1024).toFixed(2)} MB`
      );
    });
  };

  const handleCopyImage = async () => {
    if (!images.length) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      setCopyStatus('当前浏览器不支持复制图片，请使用下载功能。');
      return;
    }
    try {
      const canvas = await renderProject(project);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error('Canvas export failed')),
          'image/png'
        );
      });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopyStatus('已复制 PNG 图片，可直接粘贴。');
    } catch (error) {
      console.error('Could not copy image', error);
      setCopyStatus('复制失败，请检查剪贴板权限或改用下载。');
    }
  };

  const handleShareImage = () => {
    if (!images.length) return;
    if (!navigator.share || !navigator.canShare) {
      setCopyStatus('当前浏览器不支持直接分享图片，请先下载。');
      return;
    }
    void runExport(async () => {
      const canvas = await renderProject(project);
      const blob = await canvasToBlob(canvas, 'image/png');
      const file = new File([blob], `Picsew_${getFormattedDateTime()}.png`, {
        type: 'image/png',
      });
      const shareData = { files: [file], title: 'Picsew 长截图' };
      if (!navigator.canShare(shareData)) {
        throw new Error('当前设备不支持分享此图片，请改用下载。');
      }
      try {
        await navigator.share(shareData);
      } catch (error) {
        // Closing the OS share sheet is a normal operation, not an export error.
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        throw error;
      }
    });
  };

  const handleDownloadPDF = () => {
    if (!images.length) return;
    void runExport(async () => {
      const canvas = await exportSource(project);
      const plan = planPdfExport(
        canvas.width,
        canvas.height,
        exportConfig.pdfPageMode,
        exportConfig.pdfPpi
      );
      if (plan.mode !== exportConfig.pdfPageMode) {
        setCopyStatus('单页 PDF 太长，已自动改为 A4 分页，避免截断。');
      }
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: plan.widthPt > plan.heightPt ? 'landscape' : 'portrait',
        unit: 'pt',
        format: plan.mode === 'single' ? [plan.widthPt, plan.heightPt] : 'a4',
      });
      for (let i = 0; i < plan.count; i++) {
        const offsetY = i * plan.pageHeightPx;
        const height = Math.min(plan.pageHeightPx, canvas.height - offsetY);
        const pageCanvas = await canvas.tile(offsetY, height);
        const jpeg = await canvasToBlob(pageCanvas, 'image/jpeg', 0.9);
        if (i > 0) pdf.addPage();
        pdf.addImage(
          new Uint8Array(await jpeg.arrayBuffer()),
          'JPEG',
          0,
          0,
          plan.widthPt,
          (height / canvas.width) * plan.widthPt
        );
      }
      setCopyStatus(
        await triggerDownload(
          pdf.output('blob'),
          'application/pdf',
          `Picsew_${getFormattedDateTime()}.pdf`
        )
      );
    });
  };

  const handleDownloadZip = () => {
    const sliceHeight = Math.floor(exportConfig.scale);
    if (!images.length || sliceHeight <= 0) return;
    void runExport(async () => {
      const canvas = await exportSource(project);
      const parts = Math.ceil(canvas.height / sliceHeight);
      if (parts > 160)
        throw new Error(`需要 ${parts} 段切片，请增大高度；最多支持 160 段。`);
      const { default: JSZip } = await import('jszip');
      const archive = new JSZip();
      const mime = exportConfig.format === 'png' ? 'image/png' : 'image/jpeg';
      for (let i = 0; i < parts; i++) {
        const height = Math.min(sliceHeight, canvas.height - i * sliceHeight);
        const tempCanvas = await canvas.tile(i * sliceHeight, height);
        archive.file(
          `slice_${String(i + 1).padStart(3, '0')}.${exportConfig.format}`,
          await canvasToBlob(tempCanvas, mime, exportConfig.quality)
        );
      }
      const blob = await archive.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 3 },
      });
      setCopyStatus(
        await triggerDownload(
          blob,
          'application/zip',
          `Picsew_slices_${getFormattedDateTime()}.zip`
        )
      );
    });
  };

  const tryExample = async () => {
    if (images.length || isPreparingExample) return;
    setIsPreparingExample(true);
    try {
      const files = await createExampleFiles();
      setIsExample(true);
      setIncomingShare({ id: '', files });
      setActiveTab('upload');
      setPanelOpen(true);
    } catch (error) {
      setCopyStatus(
        error instanceof Error
          ? error.message
          : '示例生成失败，请添加自己的截图'
      );
    } finally {
      setIsPreparingExample(false);
    }
  };
  const addOwnImages = () => {
    if (isExample) {
      imageChangeSequenceRef.current++;
      commitState([], [], []);
      setIsExample(false);
      setUncertainSeams([]);
      setFocusedSeam(null);
    }
    setActiveTab('upload');
    setPanelOpen(true);
    setSelectedTool('select');
  };
  const goToStep = (stage: 'upload' | 'review' | 'save') => {
    if (stage === 'upload') {
      addOwnImages();
      return;
    }
    if (!images.length) return;
    if (stage === 'review' && uncertainSeams.length) {
      inspectSeam(uncertainSeams[0]);
      return;
    }
    setActiveTab(stage === 'review' ? 'stitch' : 'export');
    setPanelOpen(true);
    setSelectedTool('select');
  };

  const tools = [
    { id: 'upload', label: '素材', icon: Images },
    { id: 'stitch', label: '拼接', icon: WandSparkles },
    { id: 'cut', label: '裁剪', icon: PencilRuler },
    { id: 'mockup', label: '美化', icon: Sparkles },
    { id: 'export', label: '导出', icon: Download },
  ];
  const currentGroup =
    activeTab === 'cut' || activeTab === 'markup'
      ? 'cut'
      : activeTab === 'statusbar' ||
          activeTab === 'mockup' ||
          activeTab === 'watermark'
        ? 'mockup'
        : activeTab;
  const toolName =
    currentGroup === 'upload'
      ? '素材管理'
      : currentGroup === 'stitch'
        ? '拼接与对齐'
        : currentGroup === 'cut'
          ? '裁剪与标注'
          : currentGroup === 'mockup'
            ? '外观美化'
            : '保存与分享';

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
      selectedAnnotationId={selectedAnnotationId}
      onSelectAnnotation={setSelectedAnnotationId}
      onUpdateAnnotation={(anno) =>
        setAnnotations(annotations.map((a) => (a.id === anno.id ? anno : a)))
      }
      selectedTool={selectedTool}
      activeTab={cropMode ? 'view' : panelOpen ? activeTab : 'view'}
      compact={panelOpen}
      focusSliceIndex={
        cropMode
          ? Math.max(
              0,
              images.findIndex((img) => img.id === cropSelectedId)
            )
          : undefined
      }
      focusedSeam={!cropMode ? focusedSeam : null}
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
    <div
      className="workspace-app flex h-dvh w-screen flex-col overflow-hidden text-slate-800"
      inert={appUpdate.busy}
    >
      <header className="workspace-header relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-3 md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="workspace-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="m-0 whitespace-nowrap text-[14px] font-bold tracking-tight text-slate-900 sm:text-[16px]">
              <span className="sm:hidden">Picsew</span>
              <span className="hidden sm:inline">Picsew Web</span>
            </h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">
              轻松拼接每一张截图
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="workspace-icon-button rounded-xl px-3 py-2 text-sm"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((value) => !value)}
            aria-label="使用帮助"
          >
            ?
          </button>
          {uncertainSeams.length > 0 && (
            <button
              type="button"
              onClick={() => inspectSeam(uncertainSeams[0])}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-50 border border-amber-200 px-2.5 py-2 text-xs font-semibold text-amber-800"
              title="打开拼接面板，检查无法自动对齐的连接位置"
            >
              <AlertTriangle className="h-3.5 w-3.5" />{' '}
              <span className="hidden sm:inline">
                {uncertainSeams.length} 处待检查
              </span>
              <span className="sm:hidden">{uncertainSeams.length}</span>
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
            onClick={addOwnImages}
            className="workspace-top-button flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />{' '}
            <span className="hidden sm:inline">添加图片</span>
            <span className="sm:hidden">添加</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={
              !images.length || isExporting || isStitching || isPreparingExample
            }
            className="workspace-primary flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Download className="h-4 w-4" />{' '}
            {isExporting ? '正在保存…' : '保存图片'}
          </button>
        </div>
      </header>

      {appUpdate.available && (
        <aside
          className="beginner-tip flex flex-wrap items-center justify-between gap-2"
          aria-label="应用更新"
          aria-live="polite"
        >
          <p>
            {isExample
              ? '发现新版本。更新会重新打开应用，示例可以再次体验。'
              : images.length
                ? '发现新版本。更新前会保存本机草稿，重新打开后可恢复编辑。'
                : '发现新版本，更新后会重新打开应用。'}
            {appUpdate.error && (
              <span className="block text-red-700">{appUpdate.error}</span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-40"
              disabled={isStitching || isExporting || isPreparingExample}
              onClick={() => void appUpdate.update()}
            >
              更新并重新打开
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-2"
              onClick={appUpdate.dismiss}
            >
              稍后
            </button>
          </div>
        </aside>
      )}

      <QuickStart
        hasImages={images.length > 0}
        stage={
          !images.length || (panelOpen && activeTab === 'upload')
            ? 'upload'
            : panelOpen && activeTab === 'export'
              ? 'save'
              : 'review'
        }
        onStep={goToStep}
      />
      {showHelp && (
        <aside className="beginner-tip" aria-label="新手使用说明">
          <p>
            <strong>1 添加：</strong>
            按阅读顺序选截图，相邻截图保留一部分重复内容，系统才能自动找到连接位置。
          </p>
          <p>
            <strong>2 检查：</strong>
            看看文字有没有重复或缺失。需要时点“裁剪”去掉多余边缘；标注和打码也在里面。
          </p>
          <p>
            <strong>3 保存：</strong>
            直接点“保存图片”即可。PDF、压缩画质和分段保存在“更多保存选项”里。
          </p>
          <p>
            图片在本机处理。手机通常可在“文件 /
            下载”找到成品，保存到相册的方式取决于系统。
          </p>
        </aside>
      )}
      {images.length > 0 && isExample && (
        <aside className="beginner-tip" aria-label="示例模式">
          <p>
            你正在体验示例，原图和拼接结果都可以查看。准备好后，换成自己的截图。
          </p>
          <button
            type="button"
            className="mt-1 font-semibold underline"
            onClick={addOwnImages}
          >
            换成我的截图
          </button>
        </aside>
      )}
      {images.length > 0 && uncertainSeams.length > 0 && !panelOpen && (
        <aside className="beginner-tip" aria-label="拼接检查提示">
          <p>
            有 {uncertainSeams.length}{' '}
            处连接需要看一眼。确认文字没有重复或缺失即可，无需先理解像素参数。
          </p>
          <button
            type="button"
            className="mt-1 font-semibold underline"
            onClick={() => inspectSeam(uncertainSeams[0])}
          >
            检查第一处
          </button>
        </aside>
      )}
      {draft.pending && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-center gap-3 bg-blue-50 px-4 py-2 text-xs text-blue-900"
        >
          <span>
            发现本机草稿 · {draft.pending.project.images.length} 张图片
          </span>
          <button
            className="rounded-lg bg-blue-600 px-3 py-2 text-white"
            onClick={draft.restore}
          >
            恢复草稿
          </button>
          <button
            className="rounded-lg border px-3 py-2"
            onClick={() =>
              void draft
                .discard()
                .catch(() => setCopyStatus('无法清除草稿，请检查本地存储'))
            }
          >
            新建并替换草稿
          </button>
        </div>
      )}
      {copyStatus && (
        <div
          role="status"
          className="bg-blue-50 px-4 py-2 text-center text-xs text-blue-800"
        >
          {copyStatus}
          {exportFailed && (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-2"
                onClick={() => {
                  const width = getStitchedLayout(
                    images,
                    overlaps,
                    gap,
                    direction
                  ).width;
                  setExportConfig({
                    ...exportConfig,
                    width: Math.max(
                      1,
                      Math.floor((exportConfig.width || width) / 2)
                    ),
                  });
                  setActiveTab('export');
                  setPanelOpen(true);
                  setCopyStatus(
                    '已调低图片宽度，请再次点击保存图片；仍过大时可在更多选项中分段保存。'
                  );
                  setExportFailed(false);
                }}
              >
                减小尺寸再保存
              </button>
              <button
                type="button"
                className="rounded-lg border px-3 py-2"
                onClick={() => goToStep('save')}
              >
                打开保存选项
              </button>
            </div>
          )}
        </div>
      )}
      <main
        className={`workspace-main relative flex min-h-0 flex-1 flex-col ${panelOpen ? 'with-inspector' : ''}`}
      >
        {images.length === 0 ? (
          <section className="workspace-welcome mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center justify-center px-5 pb-25 text-center">
            <div className="workspace-welcome-icon mb-5 flex h-17 w-17 items-center justify-center rounded-[24px]">
              <Images className="h-8 w-8 text-blue-600" />
            </div>
            <p className="mb-2 text-xs font-bold tracking-[0.18em] text-blue-600">
              一步开始
            </p>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 md:text-4xl">
              多张截图，一张长图
            </h2>
            <p className="mb-7 max-w-[380px] text-sm leading-6 text-slate-500">
              按顺序添加截图，系统自动拼接。检查后点“保存图片”，不需要先调参数。
            </p>
            <div className="workspace-import-card w-full max-w-[450px] rounded-[26px] p-4 text-left">
              {!panelOpen && (
                <ImageUploader
                  images={images}
                  onImagesChange={handleImagesChange}
                  onAutoStitchTrigger={handleAutoStitch}
                  incomingFiles={incomingShare?.files}
                  onIncomingConsumed={consumeShare}
                  onImportMessage={showImportMessage}
                />
              )}
            </div>
            {!panelOpen && (
              <div className="mt-4 flex items-center justify-center gap-3 text-xs">
                <button
                  type="button"
                  disabled={isPreparingExample}
                  className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 font-semibold text-blue-700"
                  onClick={() => void tryExample()}
                >
                  {isPreparingExample ? '正在准备示例…' : '先用示例试试看'}
                </button>
                <button
                  type="button"
                  className="text-slate-600 underline"
                  onClick={() => setShowHelp((value) => !value)}
                >
                  第一次使用？看操作说明
                </button>
              </div>
            )}
            <p className="mt-4 text-xs text-slate-400">
              图片仅在当前设备处理，不会上传到服务器
            </p>
          </section>
        ) : (
          <>
            <section
              className="workspace-canvas min-h-0 flex-1 px-2 pb-25 pt-2 md:px-6 md:pb-25"
              aria-label="始终可见的拼接画布"
            >
              {previewCanvas}
            </section>
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

        {panelOpen && (
          <>
            <aside
              className="workspace-sheet absolute z-40 flex flex-col overflow-hidden"
              aria-label={toolName}
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/60 px-5 py-4">
                <div>
                  <h2 className="text-[17px] font-bold text-slate-900">
                    {advancedCutOpen ? '高级图片分割' : toolName}
                  </h2>
                  {advancedCutOpen ? (
                    <button
                      type="button"
                      onClick={() => setAdvancedCutOpen(false)}
                      className="mt-1 text-xs font-semibold text-blue-600"
                    >
                      ← 返回四边裁剪
                    </button>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-500">
                      画布常驻可见 · 调整即刻预览
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="关闭面板"
                  onClick={closePanel}
                  className="workspace-icon-button rounded-xl p-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {(currentGroup === 'cut' || currentGroup === 'mockup') && (
                <div className="workspace-subtabs mx-4 mt-4 flex shrink-0 gap-1 rounded-xl p-1">
                  {(currentGroup === 'cut'
                    ? [
                        { id: 'cut', label: '裁剪' },
                        { id: 'markup', label: '标注与打码' },
                      ]
                    : [
                        { id: 'mockup', label: '设备套壳' },
                        { id: 'statusbar', label: '状态栏' },
                        { id: 'watermark', label: '文字水印' },
                      ]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setSelectedTool(
                          item.id === 'markup' ? 'pen' : 'select'
                        );
                      }}
                      className={
                        activeTab === item.id
                          ? 'workspace-subtab active'
                          : 'workspace-subtab'
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                {cropMode ? (
                  <div className="h-full overflow-y-auto">
                    <ImageCropEditor
                      images={images}
                      selectedId={cropSelectedId}
                      onSelect={setCropSelectedId}
                      onChange={handleAdjustCrop}
                      onCommit={handleDragEnd}
                      onReset={handleResetOneCrop}
                      onApplyAll={(index) => {
                        const source = images[index];
                        const next = images.map((img) => {
                          let result = { ...img };
                          for (const key of [
                            'cropTop',
                            'cropBottom',
                            'cropLeft',
                            'cropRight',
                          ] as const) {
                            const vertical =
                              key === 'cropTop' || key === 'cropBottom';
                            result = {
                              ...result,
                              [key]: clampCropValue(
                                result,
                                key,
                                source[key] *
                                  (vertical
                                    ? img.height / source.height
                                    : img.width / source.width)
                              ),
                            };
                          }
                          return result;
                        });
                        commitState(
                          next,
                          clampOverlapsToVisibleImages(
                            next,
                            overlaps,
                            direction
                          ),
                          annotations
                        );
                        setUncertainSeams(next.slice(1).map((_, i) => i));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setAdvancedCutOpen(true)}
                      className="mx-4 mb-5 w-[calc(100%-2rem)] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                    >
                      高级：分割当前截图
                    </button>
                  </div>
                ) : (
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
                    onOverlapCommit={handleManualOverlapCommit}
                    uncertainSeams={uncertainSeams}
                    focusedSeamIndex={focusedSeam?.index ?? null}
                    onInspectSeam={inspectSeam}
                    onRematchSeam={rematchSeam}
                    onAcceptSeam={(index) => {
                      const remaining = uncertainSeams.filter(
                        (i) => i !== index
                      );
                      setUncertainSeams(remaining);
                      if (remaining.length) inspectSeam(remaining[0]);
                      else setCopyStatus('连接检查完成，现在可以保存图片。');
                    }}
                    onDetectBars={detectBars}
                    barSuggestion={barSuggestion}
                    onApplyBars={applyBars}
                    imageNames={images.map((img) => img.name)}
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
                    selectedAnnotation={annotations.find(
                      (a) => a.id === selectedAnnotationId
                    )}
                    onEditAnnotation={(anno) =>
                      commitState(
                        images,
                        overlaps,
                        annotations.map((a) => (a.id === anno.id ? anno : a))
                      )
                    }
                    onDeleteAnnotation={() => {
                      commitState(
                        images,
                        overlaps,
                        annotations.filter((a) => a.id !== selectedAnnotationId)
                      );
                      setSelectedAnnotationId(null);
                    }}
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
                    outputSize={getStitchedLayout(
                      images,
                      overlaps,
                      gap,
                      direction
                    )}
                    hasImages={images.length > 0}
                    onResetCropsAndSplits={handleResetCropsAndSplits}
                    isMobile={isMobile}
                    images={images}
                    onImagesChange={handleImagesChange}
                    onAutoStitchTrigger={handleAutoStitch}
                    incomingFiles={incomingShare?.files}
                    onIncomingConsumed={consumeShare}
                    onImportMessage={showImportMessage}
                  />
                )}
              </div>
              <div className="workspace-sheet-footer shrink-0 px-5 py-3 text-xs text-slate-400">
                <Check className="mr-1 inline h-3 w-3 text-emerald-600" />{' '}
                {draft.status || '编辑仅在本机处理'}
              </div>
            </aside>
          </>
        )}

        <nav
          className="workspace-dock absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-[22px] p-1.5"
          aria-label="主要工具"
        >
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => openTool(tool.id)}
                aria-pressed={panelOpen && currentGroup === tool.id}
                className={
                  panelOpen && currentGroup === tool.id
                    ? 'workspace-dock-item active'
                    : 'workspace-dock-item'
                }
              >
                <Icon className="h-[19px] w-[19px]" />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </nav>
      </main>
      {appUpdate.busy &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 px-6"
            role="status"
            aria-live="polite"
          >
            <p className="rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-slate-800 shadow-xl">
              正在准备更新，请稍候…
            </p>
          </div>,
          document.body
        )}
    </div>
  );
}

export default App;
