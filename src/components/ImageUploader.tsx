import React, { useRef } from 'react';
import { Upload, X, ChevronUp, ChevronDown, Crop } from 'lucide-react';
import type { StitchedImage } from '../types';

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (files: File[]) => {
    // SECURITY: Limit number of files to prevent DoS
    let filesToProcess = files;
    if (images.length + filesToProcess.length > 50) {
      alert('最多只能添加 50 张图片 (Maximum 50 images allowed)');
      filesToProcess = filesToProcess.slice(0, Math.max(0, 50 - images.length));
    }

    // SECURITY: Limit file size to prevent memory exhaustion (50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const validFiles = filesToProcess.filter(f => {
      if (!f.type.startsWith('image/')) return false;

      // SECURITY: Block SVGs to prevent potential XSS/XXE vectors when rendered
      if (f.type.includes('svg') || f.name.toLowerCase().endsWith('.svg')) {
        alert(`不支持 SVG 格式图片以防止安全风险 (SVG images are blocked for security)`);
        return false;
      }

      if (f.size > MAX_FILE_SIZE) {
        alert(`图片 ${f.name} 过大，最大允许 50MB (Image too large, max 50MB)`);
        return false;
      }
      return true;
    });
    
    const loadPromises = validFiles.map(file => {
      return new Promise<StitchedImage | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            // SECURITY: Validate uncompressed pixel footprint to prevent Image Bomb / Pixel Flood OOM DoS
            const MAX_PIXELS = 50000000; // 50 Megapixels
            if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
              alert(`图片 ${file.name} 像素过大，可能导致内存溢出 (Image pixel dimensions too large)`);
              resolve(null);
              return;
            }

            resolve({
              id: crypto.randomUUID(),
              name: file.name,
              src: event.target?.result as string,
              width: img.naturalWidth,
              height: img.naturalHeight,
              cropTop: 0,
              cropBottom: 0,
              cropLeft: 0,
              cropRight: 0
            });
          };
          img.onerror = () => {
            console.error(`Failed to load image: ${file.name}`);
            resolve(null);
          };
          img.src = event.target?.result as string;
        };
        reader.onerror = () => {
          console.error(`Failed to read file: ${file.name}`);
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(loadPromises).then(results => {
      const newImages = results.filter((img): img is StitchedImage => img !== null);
      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
      }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
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
          // Keep crops positive and smaller than image height/width
          let cleanValue = Math.max(0, value);
          if (field === 'cropTop' || field === 'cropBottom') {
            cleanValue = Math.min(img.height - img.cropTop - img.cropBottom - 10, cleanValue);
          } else {
            cleanValue = Math.min(img.width - img.cropLeft - img.cropRight - 10, cleanValue);
          }
          return { ...img, [field]: cleanValue };
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
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className="border-2 border-dashed border-dark-700 hover:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none rounded-2xl p-6 mb-4 flex flex-col items-center justify-center cursor-pointer transition-colors duration-200 glass-card text-center"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept="image/png, image/jpeg, image/webp"
          className="hidden"
        />
        <div className="p-3 bg-primary-500/10 rounded-full text-primary-300 mb-3">
          <Upload className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium text-gray-200">点击或将图片拖拽至此</p>
        <p className="text-xs text-gray-400 mt-1">支持所有图片格式</p>
      </div>

      {/* Action panel */}
      {images.length > 1 && (
        <button
          onClick={onAutoStitchTrigger}
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
                    className="p-0.5 hover:bg-dark-700 text-gray-400 disabled:text-gray-600 disabled:hover:bg-transparent rounded focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    disabled={index === images.length - 1}
                    onClick={() => moveImage(index, 'down')}
                    aria-label="下移图片"
                    title="下移图片"
                    className="p-0.5 hover:bg-dark-700 text-gray-400 disabled:text-gray-600 disabled:hover:bg-transparent rounded focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => removeImage(img.id)}
                  aria-label="移除图片"
                  title="移除图片"
                  className="p-1 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus:outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Crop Fine-Tuning (4 Borders) */}
              <div className="bg-dark-900/60 p-2 rounded-lg mt-1 border border-dark-700/30">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium mb-1.5">
                  <Crop className="w-3.5 h-3.5 text-primary-300" />
                  <span>单图裁切边缘 (像素)</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <label htmlFor={`cropTop-${img.id}`} className="text-[10px] text-gray-500 font-medium">顶部 (Top)</label>
                    <input
                      id={`cropTop-${img.id}`}
                      type="number"
                      value={img.cropTop}
                      onChange={(e) => updateCrop(img.id, 'cropTop', parseInt(e.target.value) || 0)}
                      className="w-full bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5 text-gray-300 mt-0.5 focus:border-primary-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor={`cropBottom-${img.id}`} className="text-[10px] text-gray-500 font-medium">底部 (Bottom)</label>
                    <input
                      id={`cropBottom-${img.id}`}
                      type="number"
                      value={img.cropBottom}
                      onChange={(e) => updateCrop(img.id, 'cropBottom', parseInt(e.target.value) || 0)}
                      className="w-full bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5 text-gray-300 mt-0.5 focus:border-primary-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor={`cropLeft-${img.id}`} className="text-[10px] text-gray-500 font-medium">左侧 (Left)</label>
                    <input
                      id={`cropLeft-${img.id}`}
                      type="number"
                      value={img.cropLeft}
                      onChange={(e) => updateCrop(img.id, 'cropLeft', parseInt(e.target.value) || 0)}
                      className="w-full bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5 text-gray-300 mt-0.5 focus:border-primary-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor={`cropRight-${img.id}`} className="text-[10px] text-gray-500 font-medium">右侧 (Right)</label>
                    <input
                      id={`cropRight-${img.id}`}
                      type="number"
                      value={img.cropRight}
                      onChange={(e) => updateCrop(img.id, 'cropRight', parseInt(e.target.value) || 0)}
                      className="w-full bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5 text-gray-300 mt-0.5 focus:border-primary-500 outline-hidden"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
