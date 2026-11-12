import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Upload,
  X,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Film,
  Ban,
} from 'lucide-react';
import type { StitchedImage } from '../types';
import { reorderImages } from '../utils/imageState';
import { extractVideoFrames } from '../utils/videoFrames';
import { importFeedback, supportedRasterHeader } from '../utils/importFeedback';
import { sortScreenshotFiles } from '../utils/importOrder';

interface ImageUploaderProps {
  onImportMessage?: (message: string) => void;
  incomingFiles?: File[];
  onIncomingConsumed?: () => void;
  images: StitchedImage[];
  onImagesChange: (
    images: StitchedImage[]
  ) => void | boolean | Promise<void | boolean>;
  onAutoStitchTrigger: () => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  incomingFiles,
  onIncomingConsumed,
  onImportMessage,
  onImagesChange,
  onAutoStitchTrigger,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoAbortRef = useRef<AbortController | null>(null);
  const importingRef = useRef(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoRange, setVideoRange] = useState({ start: 0, end: 180 });
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!pendingVideo) {
      setVideoUrl('');
      return;
    }
    const url = URL.createObjectURL(pendingVideo);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingVideo]);
  const [videoProgress, setVideoProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const touchSortRef = useRef<{
    sourceId: string;
    targetId: string;
    active: boolean;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const consumedIncoming = useRef<File[] | null>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Allow choosing the same screenshot again after removing it.
    e.target.value = '';
    if (files.length) void addFiles(files);
  };

  const addFiles = useCallback(
    async (files: File[]) => {
      if (importingRef.current) {
        setUploadMessage('图片正在导入，请完成后再添加。');
        return;
      }
      importingRef.current = true;
      setIsImporting(true);
      setUploadMessage('');
      onImportMessage?.('');

      const skipped = { limit: 0, format: 0, size: 0, pixels: 0, failed: 0 };
      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      const MAX_PIXELS = 25_000_000;
      const supportedTypes = new Set([
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'image/gif',
      ]);
      const available = Math.max(0, 50 - images.length);
      const filesToProcess = sortScreenshotFiles(files).slice(0, available);
      skipped.limit = files.length - filesToProcess.length;
      const loaded: StitchedImage[] = [];
      let totalPixels = images.reduce(
        (n, img) => n + img.width * img.height,
        0
      );

      try {
        // Decode sequentially instead of allocating dozens of large images at once.
        for (const file of filesToProcess) {
          if (
            (file.type
              ? !supportedTypes.has(file.type)
              : !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) ||
            file.name.toLowerCase().endsWith('.svg')
          ) {
            skipped.format++;
            continue;
          }
          if (file.size > MAX_FILE_SIZE) {
            skipped.size++;
            continue;
          }

          try {
            if (
              !supportedRasterHeader(
                new Uint8Array(await file.slice(0, 16).arrayBuffer()),
                file.type
              )
            ) {
              skipped.format++;
              continue;
            }
            const src = URL.createObjectURL(file);
            let image: StitchedImage;
            try {
              const element = new Image();
              element.src = src;
              await element.decode();
              const pixels = element.naturalWidth * element.naturalHeight;
              if (
                !pixels ||
                pixels > MAX_PIXELS ||
                totalPixels + pixels > 80_000_000
              )
                throw new Error('pixels');
              image = {
                id: crypto.randomUUID(),
                name: file.name,
                src,
                width: element.naturalWidth,
                height: element.naturalHeight,
                cropTop: 0,
                cropBottom: 0,
                cropLeft: 0,
                cropRight: 0,
              };
              totalPixels += pixels;
              element.src = '';
            } catch (error) {
              URL.revokeObjectURL(src);
              throw error;
            }
            loaded.push(image);
          } catch (error) {
            if (error instanceof Error && error.message === 'pixels')
              skipped.pixels++;
            else skipped.failed++;
          }
        }

        if (loaded.length) {
          const accepted = await onImagesChange([...images, ...loaded]);
          if (accepted === false) {
            for (const image of loaded) URL.revokeObjectURL(image.src);
            return 0;
          }
        }
        const message = importFeedback(loaded.length, skipped);
        setUploadMessage(message);
        if (Object.values(skipped).some(Boolean)) onImportMessage?.(message);
        return loaded.length;
      } catch (error) {
        console.error('Image import failed', error);
        for (const image of loaded) URL.revokeObjectURL(image.src);
        setUploadMessage(
          '图片导入失败，请重新选择原始截图；已有图片仍会保留。'
        );
        return 0;
      } finally {
        importingRef.current = false;
        setIsImporting(false);
      }
    },
    [images, onImagesChange, onImportMessage]
  );

  useEffect(() => {
    if (incomingFiles?.length && consumedIncoming.current !== incomingFiles) {
      consumedIncoming.current = incomingFiles;
      void addFiles(incomingFiles).then((count) => {
        if (count) onIncomingConsumed?.();
      });
    }
  }, [incomingFiles, addFiles, onIncomingConsumed]);
  // Cancel an in-progress video decode when the upload view is closed.
  useEffect(() => () => videoAbortRef.current?.abort(), []);

  const handleVideoFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file && !importingRef.current) setPendingVideo(file);
  };
  const importVideo = async (singleFrame = false) => {
    const file = pendingVideo;
    if (!file) return;
    if (importingRef.current) {
      setUploadMessage('请先完成当前的导入任务');
      return;
    }
    importingRef.current = true;
    setIsImporting(true);
    setUploadMessage('');
    setVideoProgress({ done: 0, total: 0 });
    const controller = new AbortController();
    videoAbortRef.current = controller;
    try {
      const result = await extractVideoFrames(
        file,
        Math.min(40, 50 - images.length),
        controller.signal,
        (done, total) => setVideoProgress({ done, total }),
        singleFrame
          ? {
              singleFrameTime:
                videoPreviewRef.current?.currentTime ?? videoRange.start,
            }
          : videoRange
      );
      if (controller.signal.aborted) return;
      const budget =
        images.reduce((n, img) => n + img.width * img.height, 0) +
        result.images.reduce((n, img) => n + img.width * img.height, 0);
      if (budget > 80_000_000) {
        for (const image of result.images) URL.revokeObjectURL(image.src);
        throw new Error('抽帧结果超出项目像素预算，请缩短区间或减少保留帧');
      }
      if (result.images.length > 0)
        await onImagesChange([...images, ...result.images]);
      const message =
        `录屏已分析 ${result.considered} 帧，提取 ${result.images.length} 张滚动画面。` +
        (result.uncertainTransitions
          ? ` 有 ${result.uncertainTransitions} 处变化尚无法可靠对齐，请检查拼接接缝。`
          : '') +
        (result.truncated
          ? ' 已达到截图张数上限，部分尾部内容尚未导入；请拆分录屏。'
          : '');
      setUploadMessage(message);
      onImportMessage?.(message);
    } catch (error) {
      if (!controller.signal.aborted) {
        setUploadMessage(
          error instanceof Error ? error.message : '录屏解析失败'
        );
      }
    } finally {
      if (videoAbortRef.current === controller) videoAbortRef.current = null;
      importingRef.current = false;
      setVideoProgress(null);
      setIsImporting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isImporting) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node | null))
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length)
      void addFiles(Array.from(e.dataTransfer.files));
  };

  // Long-press the grab handle on touchscreens. All other areas keep native scrolling.
  const onTouchSortStart = (
    event: React.PointerEvent<HTMLButtonElement>,
    sourceId: string
  ) => {
    if (event.pointerType === 'mouse' || images.length < 2) return;
    const gesture = {
      sourceId,
      targetId: sourceId,
      active: false,
      x: event.clientX,
      y: event.clientY,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    touchSortRef.current = gesture;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.timer = setTimeout(() => {
      if (touchSortRef.current !== gesture) return;
      gesture.active = true;
      setDragSourceId(sourceId);
      setDragTargetId(sourceId);
    }, 240);
  };

  const onTouchSortMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = touchSortRef.current;
    if (!gesture) return;
    if (!gesture.active) {
      if (
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12
      ) {
        if (gesture.timer) clearTimeout(gesture.timer);
        touchSortRef.current = null;
      }
      return;
    }
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-picsew-image-id]');
    const targetId = target?.dataset.picsewImageId;
    if (targetId) {
      gesture.targetId = targetId;
      setDragTargetId(targetId);
    }
  };

  const endTouchSort = () => {
    const gesture = touchSortRef.current;
    if (!gesture) return;
    if (gesture.timer) clearTimeout(gesture.timer);
    if (gesture.active && gesture.targetId !== gesture.sourceId) {
      onImagesChange(reorderImages(images, gesture.sourceId, gesture.targetId));
    }
    touchSortRef.current = null;
    setDragSourceId(null);
    setDragTargetId(null);
  };

  const cancelTouchSort = () => {
    if (touchSortRef.current?.timer) clearTimeout(touchSortRef.current.timer);
    touchSortRef.current = null;
    setDragSourceId(null);
    setDragTargetId(null);
  };

  const onSortDrop = (targetId: string) => {
    if (dragSourceId) {
      const changed = reorderImages(images, dragSourceId, targetId);
      if (changed !== images) onImagesChange(changed);
    }
    setDragSourceId(null);
    setDragTargetId(null);
  };

  const removeImage = (id: string) => {
    onImagesChange(images.filter((img) => img.id !== id));
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= images.length) return;

    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    onImagesChange(updated);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {pendingVideo && (
        <section
          className="mb-3 space-y-2 rounded-xl border p-3 text-xs"
          aria-label="录屏区间选择"
        >
          <video
            ref={videoPreviewRef}
            src={videoUrl}
            controls
            playsInline
            preload="metadata"
            className="max-h-44 w-full rounded-lg"
            onLoadedMetadata={(e) =>
              setVideoRange({
                start: 0,
                end: Math.min(180, e.currentTarget.duration),
              })
            }
          />
          <div className="flex gap-2">
            <label>
              开始（秒）
              <input
                type="number"
                aria-label="录屏开始时间"
                min={0}
                step={0.1}
                value={videoRange.start}
                onChange={(e) =>
                  setVideoRange((r) => ({
                    ...r,
                    start: Number(e.target.value),
                  }))
                }
                className="w-full"
              />
            </label>
            <label>
              结束（秒）
              <input
                type="number"
                aria-label="录屏结束时间"
                min={0}
                step={0.1}
                value={videoRange.end}
                onChange={(e) =>
                  setVideoRange((r) => ({ ...r, end: Number(e.target.value) }))
                }
                className="w-full"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isImporting}
              className="rounded-lg bg-blue-600 px-3 py-2 text-white"
              onClick={() => void importVideo()}
            >
              提取所选区间
            </button>
            <button
              type="button"
              disabled={isImporting}
              className="rounded-lg border px-3 py-2"
              onClick={() => void importVideo(true)}
            >
              补入当前帧
            </button>
            <button
              type="button"
              disabled={isImporting}
              className="rounded-lg border px-3 py-2"
              onClick={() => setPendingVideo(null)}
            >
              关闭预览
            </button>
          </div>
        </section>
      )}
      {/* Upload Zone */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-disabled={isImporting}
        onClick={() => {
          if (!isImporting) fileInputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isImporting) fileInputRef.current?.click();
          }
        }}
        className={`border-2 border-dashed focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none rounded-2xl p-6 mb-4 flex flex-col items-center justify-center transition-all duration-200 glass-card text-center ${isDragging ? 'border-primary-500 bg-primary-500/20 scale-[1.01]' : 'border-slate-200 hover:border-primary-500'} ${isImporting ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={isImporting}
          className="hidden"
        />
        <div className="p-3 bg-primary-500/10 rounded-full text-blue-600 mb-3">
          <Upload className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium text-slate-700">
          {isImporting
            ? '正在导入图片…'
            : isDragging
              ? '松开即可添加图片'
              : '点击或拖拽添加截图'}
        </p>
        <p className="text-xs text-slate-600 mt-1">
          PNG / JPEG / WebP / GIF · 最多 50 张
        </p>
      </div>
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mov,.m4v"
        className="hidden"
        onChange={handleVideoFileChange}
        disabled={isImporting}
      />
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          disabled={isImporting}
          onClick={() => videoInputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-primary-50 disabled:opacity-50"
        >
          <Film className="h-4 w-4 text-primary-500" /> 从录屏提取
        </button>
        {videoProgress && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs text-red-500"
            onClick={() => videoAbortRef.current?.abort()}
          >
            <Ban className="h-4 w-4" /> 取消
          </button>
        )}
      </div>
      {videoProgress && (
        <div className="mb-3" role="status" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>正在提取录屏帧</span>
            <span>
              {videoProgress.total
                ? Math.round((videoProgress.done / videoProgress.total) * 100)
                : 0}
              %
            </span>
          </div>
          <progress
            className="h-2 w-full accent-primary-500"
            value={videoProgress.done}
            max={videoProgress.total || 1}
          />
        </div>
      )}
      {uploadMessage && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-amber-600 mb-3 rounded-lg bg-amber-500/10 px-3 py-2"
        >
          {uploadMessage}
        </p>
      )}

      {/* Action panel */}
      {images.length > 1 && (
        <button
          onClick={onAutoStitchTrigger}
          disabled={isImporting}
          className="w-full bg-linear-to-r from-primary-600 to-primary-400 hover:from-primary-700 hover:to-primary-500 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg transition-all duration-200 mb-4 text-sm"
        >
          🚀 智能一键拼接
        </button>
      )}

      {images.length > 1 && (
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>从上往下拼接 · {images.length} 张</span>
          <button
            type="button"
            onClick={() =>
              onImagesChange(
                [...images].sort((a, b) =>
                  new Intl.Collator('zh-CN', {
                    numeric: true,
                    sensitivity: 'base',
                  }).compare(a.name, b.name)
                )
              )
            }
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-blue-600 font-semibold"
          >
            按文件名重排
          </button>
        </div>
      )}
      {/* Image list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {images.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            暂无上传的图片
          </div>
        ) : (
          images.map((img, index) => (
            <div
              key={img.id}
              data-picsew-image-id={img.id}
              onDragOver={(e) => {
                if (dragSourceId) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragTargetId(img.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                onSortDrop(img.id);
              }}
              className={`p-3 rounded-xl relative group flex flex-col gap-2 transition-all ${dragTargetId === img.id && dragSourceId !== img.id ? 'bg-blue-50 border-2 border-blue-400' : 'bg-slate-50 border border-slate-200'} ${dragSourceId === img.id ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="shrink-0 text-xs font-bold text-blue-600"
                  title="拼接顺序"
                >
                  {index + 1}
                </span>
                <button
                  type="button"
                  draggable
                  onPointerDown={(e) => onTouchSortStart(e, img.id)}
                  onPointerMove={onTouchSortMove}
                  onPointerUp={endTouchSort}
                  onPointerCancel={cancelTouchSort}
                  style={{ touchAction: 'none' }}
                  onDragStart={(e) => {
                    setDragSourceId(img.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', img.id);
                  }}
                  onDragEnd={() => {
                    setDragSourceId(null);
                    setDragTargetId(null);
                  }}
                  aria-label={`长按或拖动调整第 ${index + 1} 张图片顺序`}
                  title="拖动排序，触屏长按后拖动"
                  className="cursor-grab rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                {/* Thumbnail */}
                <div className="w-12 h-16 rounded-md overflow-hidden bg-slate-50 border border-slate-200 flex-shrink-0 flex items-center justify-center">
                  <img
                    src={img.src}
                    alt={img.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {img.name}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {img.width} × {img.height}px
                  </p>
                </div>

                {/* Move / Action buttons */}
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    disabled={index === 0}
                    onClick={() => moveImage(index, 'up')}
                    aria-label="上移图片"
                    title="上移图片"
                    className="p-2 hover:bg-slate-100 text-slate-600 disabled:text-slate-400 disabled:hover:bg-transparent rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    disabled={index === images.length - 1}
                    onClick={() => moveImage(index, 'down')}
                    aria-label="下移图片"
                    title="下移图片"
                    className="p-2 hover:bg-slate-100 text-slate-600 disabled:text-slate-400 disabled:hover:bg-transparent rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => removeImage(img.id)}
                  aria-label="移除图片"
                  title="移除图片"
                  className="p-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus:outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
