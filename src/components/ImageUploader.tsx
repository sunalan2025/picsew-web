import React, { useRef, useState } from 'react';
import { Upload, X, ChevronUp, ChevronDown, Crop } from 'lucide-react';
import type { StitchedImage } from '../types';
import { clampCropValue } from '../utils/imageState';

interface ImageUploaderProps {
  images: StitchedImage[];
  onImagesChange: (images: StitchedImage[]) => void;
  onAutoStitchTrigger: () => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  onImagesChange,
  onAutoStitchTrigger
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importingRef = useRef(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Allow choosing the same screenshot again after removing it.
    e.target.value = '';
    if (files.length) void addFiles(files);
  };

  const addFiles = async (files: File[]) => {
    if (importingRef.current) {
      setUploadMessage('图片正在导入，请完成后再添加。');
      return;
    }
    importingRef.current = true;
    setIsImporting(true);
    setUploadMessage('');

    const skipped = { limit: 0, format: 0, size: 0, pixels: 0, failed: 0 };
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const MAX_PIXELS = 25_000_000;
    const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    const available = Math.max(0, 50 - images.length);
    const filesToProcess = files.slice(0, available);
    skipped.limit = files.length - filesToProcess.length;
    const loaded: StitchedImage[] = [];

    try {
      // Decode sequentially instead of allocating dozens of large images at once.
      for (const file of filesToProcess) {
        if (!supportedTypes.has(file.type) || file.name.toLowerCase().endsWith('.svg')) {
          skipped.format++;
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          skipped.size++;
          continue;
        }

        try {
          const image = await new Promise<StitchedImage>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('read'));
            reader.onabort = () => reject(new Error('read'));
            reader.onload = () => {
              const src = reader.result;
              if (typeof src !== 'string' || !src.startsWith('data:image/')) {
                reject(new Error('read'));
                return;
              }
              const img = new Image();
              img.onerror = () => reject(new Error('decode'));
              img.onload = () => {
                if (!img.naturalWidth || !img.naturalHeight ||
                    img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
                  reject(new Error('pixels'));
                  return;
                }
                resolve({
                  id: crypto.randomUUID(),
                  name: file.name,
                  src,
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                  cropTop: 0,
                  cropBottom: 0,
                  cropLeft: 0,
                  cropRight: 0
                });
              };
              img.src = src;
            };
            try {
              reader.readAsDataURL(file);
            } catch {
              reject(new Error('read'));
            }
          });
          loaded.push(image);
        } catch (error) {
          if (error instanceof Error && error.message === 'pixels') skipped.pixels++;
          else skipped.failed++;
        }
      }

      if (loaded.length) await onImagesChange([...images, ...loaded]);
      const warnings = [
        skipped.limit && `超过 50 张上限 ${skipped.limit} 张`,
        skipped.format && `格式不支持 ${skipped.format} 张`,
        skipped.size && `超过 50 MB ${skipped.size} 张`,
        skipped.pixels && `超过 2500 万像素 ${skipped.pixels} 张`,
        skipped.failed && `读取失败 ${skipped.failed} 张`
      ].filter(Boolean);
      if (warnings.length) {
        setUploadMessage(`已导入 ${loaded.length} 张；跳过：${warnings.join('、')}。`);
      }
    } catch (error) {
      console.error('Image import failed', error);
      setUploadMessage('图片导入失败，请重试。');
    } finally {
      importingRef.current = false;
      setIsImporting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isImporting) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) void addFiles(Array.from(e.dataTransfer.files));
  };

  const removeImage = (id: string) => {
    onImagesChange(images.filter(img => img.id !== id));
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

  const updateCrop = (id: string, field: 'cropTop' | 'cropBottom' | 'cropLeft' | 'cropRight', value: number) => {
    onImagesChange(
      images.map(img => {
        if (img.id === id) {
          return { ...img, [field]: clampCropValue(img, field, value) };
        }
        return img;
      })
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Upload Zone */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-disabled={isImporting}
        onClick={() => { if (!isImporting) fileInputRef.current?.click(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isImporting) fileInputRef.current?.click();
          }
        }}
        className={`border-2 border-dashed focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none rounded-2xl p-6 mb-4 flex flex-col items-center justify-center transition-all duration-200 glass-card text-center ${isDragging ? 'border-primary-500 bg-primary-500/20 scale-[1.01]' : 'border-dark-700 hover:border-primary-500'} ${isImporting ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
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
        <div className="p-3 bg-primary-500/10 rounded-full text-primary-300 mb-3">
          <Upload className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium text-gray-200">
          {isImporting ? '正在导入图片…' : isDragging ? '松开即可添加图片' : '点击或拖拽添加截图'}
        </p>
        <p className="text-xs text-gray-400 mt-1">PNG / JPEG / WebP / GIF · 最多 50 张</p>
      </div>
      {uploadMessage && (
        <p role="status" aria-live="polite" className="text-xs text-amber-300 mb-3 rounded-lg bg-amber-500/10 px-3 py-2">
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

      {/* Image list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {images.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            暂无上传的图片
          </div>
        ) : (
          images.map((img, index) => (
            <div
              key={img.id}
              className="p-3 bg-dark-800 border border-dark-700/50 rounded-xl relative group flex flex-col gap-2"
            >
              <div className="flex items-center gap-3">
                {/* Thumbnail */}
                <div className="w-12 h-16 rounded-md overflow-hidden bg-dark-900 border border-dark-700 flex-shrink-0 flex items-center justify-center">
                  <img
                    src={img.src}
                    alt={img.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-300 truncate">
                    {img.name}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
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
                    className="p-2 hover:bg-dark-700 text-gray-400 disabled:text-gray-600 disabled:hover:bg-transparent rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    disabled={index === images.length - 1}
                    onClick={() => moveImage(index, 'down')}
                    aria-label="下移图片"
                    title="下移图片"
                    className="p-2 hover:bg-dark-700 text-gray-400 disabled:text-gray-600 disabled:hover:bg-transparent rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
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

              {/* Crop Fine-Tuning (4 Borders) */}
              <details className="bg-dark-900/60 p-2 rounded-lg mt-1 border border-dark-700/30">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400 font-medium">
                  <Crop className="w-3.5 h-3.5 text-primary-400" />
                  <span>微调裁剪</span>
                  <span className="ml-auto text-[10px] opacity-60">展开</span>
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <label htmlFor={`cropTop-${img.id}`} className="text-[10px] text-gray-500 font-medium">顶部</label>
                    <input
                      id={`cropTop-${img.id}`}
                      type="number"
                      value={img.cropTop}
                      onChange={(e) => updateCrop(img.id, 'cropTop', parseInt(e.target.value) || 0)}
                      className="w-full bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5 text-gray-300 mt-0.5 focus:border-primary-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor={`cropBottom-${img.id}`} className="text-[10px] text-gray-500 font-medium">底部</label>
                    <input
                      id={`cropBottom-${img.id}`}
                      type="number"
                      value={img.cropBottom}
                      onChange={(e) => updateCrop(img.id, 'cropBottom', parseInt(e.target.value) || 0)}
                      className="w-full bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5 text-gray-300 mt-0.5 focus:border-primary-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor={`cropLeft-${img.id}`} className="text-[10px] text-gray-500 font-medium">左侧</label>
                    <input
                      id={`cropLeft-${img.id}`}
                      type="number"
                      value={img.cropLeft}
                      onChange={(e) => updateCrop(img.id, 'cropLeft', parseInt(e.target.value) || 0)}
                      className="w-full bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5 text-gray-300 mt-0.5 focus:border-primary-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor={`cropRight-${img.id}`} className="text-[10px] text-gray-500 font-medium">右侧</label>
                    <input
                      id={`cropRight-${img.id}`}
                      type="number"
                      value={img.cropRight}
                      onChange={(e) => updateCrop(img.id, 'cropRight', parseInt(e.target.value) || 0)}
                      className="w-full bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5 text-gray-300 mt-0.5 focus:border-primary-500 outline-hidden"
                    />
                  </div>
                </div>
              </details>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
