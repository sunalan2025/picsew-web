import React from 'react';
import {
  Scissors, Type, Battery, ShieldAlert, Monitor, Download, FileText, Split, Undo, Redo, Trash2, Check, Layers, FolderOpen
} from 'lucide-react';
import type {
  AnnotationType,
  StatusBarConfig,
  MockupConfig,
  ExportConfig,
  StitchedImage
} from '../types';
import { ImageUploader } from './ImageUploader';

interface ControlPanelProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  // Stitching
  direction: 'vertical' | 'horizontal';
  setDirection: (dir: 'vertical' | 'horizontal') => void;
  gap: number;
  setGap: (gap: number) => void;
  overlaps: number[];
  setOverlaps: (overlaps: number[]) => void;
  imageNames: string[];

  // Markup
  selectedTool: AnnotationType | 'select' | 'cut-horizontal' | 'cut-vertical';
  setSelectedTool: (tool: any) => void;
  color: string;
  setColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAnnotations: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Status Bar
  statusBar: StatusBarConfig;
  setStatusBar: (config: StatusBarConfig) => void;

  // Mockups
  mockup: MockupConfig;
  setMockup: (config: MockupConfig) => void;

  // Export
  exportConfig: ExportConfig;
  setExportConfig: (config: ExportConfig) => void;
  onDownloadImage: () => void;
  onDownloadPDF: () => void;
  onDownloadZip: () => void;

  hasImages: boolean;
  onResetCropsAndSplits?: () => void;

  // Mobile responsiveness addition
  isMobile?: boolean;
  images?: StitchedImage[];
  onImagesChange?: (imgs: StitchedImage[]) => void;
  onAutoStitchTrigger?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  activeTab,
  setActiveTab,
  direction,
  setDirection,
  gap,
  setGap,
  overlaps,
  setOverlaps,
  imageNames,
  selectedTool,
  setSelectedTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  fontSize,
  setFontSize,
  onUndo,
  onRedo,
  onClearAnnotations,
  canUndo,
  canRedo,
  statusBar,
  setStatusBar,
  mockup,
  setMockup,
  exportConfig,
  setExportConfig,
  onDownloadImage,
  onDownloadPDF,
  onDownloadZip,
  hasImages,
  onResetCropsAndSplits,
  isMobile = false,
  images,
  onImagesChange,
  onAutoStitchTrigger
}) => {
  const tabs = [
    ...(isMobile ? [{ id: 'upload', label: '素材', icon: FolderOpen }] : []),
    { id: 'stitch', label: '拼接', icon: Layers },
    { id: 'cut', label: '裁剪', icon: Scissors },
    { id: 'markup', label: '标注', icon: Type },
    { id: 'statusbar', label: '状态栏', icon: Battery },
    { id: 'mockup', label: '套壳', icon: Monitor },
    { id: 'export', label: '导出', icon: Download },
  ];

  const colors = [
    '#ff3b30', // Red
    '#34c759', // Green
    '#007aff', // Blue
    '#ffcc00', // Yellow
    '#af52de', // Purple
    '#ffffff', // White
    '#000000', // Black
  ];

  const updateOverlap = (index: number, val: number) => {
    const updated = [...overlaps];
    updated[index] = val;
    setOverlaps(updated);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Navigation tabs */}
      <div
        role="tablist"
        aria-label="控制面板标签"
        className="flex border-b border-dark-700/80 p-1 bg-dark-900/60 shrink-0 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== 'cut' && (selectedTool === 'cut-horizontal' || selectedTool === 'cut-vertical')) {
                  setSelectedTool('select');
                }
                if (tab.id === 'markup' && selectedTool === 'select') {
                  setSelectedTool('pen');
                }
              }}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1.5 min-w-[50px] text-[10px] font-semibold rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none ${
                isActive
                  ? 'bg-primary-500/15 text-primary-300 border border-primary-500/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-dark-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 mb-1" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="flex-1 overflow-y-auto p-4 space-y-5"
      >
        {!hasImages && activeTab !== 'upload' && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 text-xs py-10">
            <ShieldAlert className="w-8 h-8 text-gray-600 mb-2" />
            <p>{isMobile ? '请先切换到“素材”卡片上传截图' : '请先在左侧上传截图以开始编辑'}</p>
          </div>
        )}

        {/* 0. Upload Tab (Mobile Only) */}
        {isMobile && activeTab === 'upload' && images && onImagesChange && (
          <div className="h-full flex flex-col min-h-0">
            <ImageUploader
              images={images}
              onImagesChange={onImagesChange}
              onAutoStitchTrigger={onAutoStitchTrigger || (() => {})}
            />
          </div>
        )}

        {hasImages && (
          <>
            {/* 1. Stitch Tab */}
            {activeTab === 'stitch' && (
              <div className="space-y-4">
                <div className="bg-primary-500/10 border border-primary-500/20 p-2.5 rounded-lg text-[11px] text-gray-300">
                  💡 <b>提示</b>：现在您可以直接在预览图的接缝附近<b>按住左键上下拖拽</b>，调整图片对齐重叠度。
                </div>

                {/* Direction */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400">拼接方向</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDirection('vertical')}
                      aria-pressed={direction === 'vertical'}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none ${
                        direction === 'vertical'
                          ? 'bg-primary-600 text-white'
                          : 'bg-dark-800 text-gray-400 border border-dark-700/50 hover:bg-dark-700'
                      }`}
                    >
                      垂直拼接
                    </button>
                    <button
                      onClick={() => setDirection('horizontal')}
                      aria-pressed={direction === 'horizontal'}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none ${
                        direction === 'horizontal'
                          ? 'bg-primary-600 text-white'
                          : 'bg-dark-800 text-gray-400 border border-dark-700/50 hover:bg-dark-700'
                      }`}
                    >
                      水平拼接
                    </button>
                  </div>
                </div>

                {/* Gap */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-gray-400">
                    <span>接缝间距 (Gap)</span>
                    <span className="text-primary-300 font-mono">{gap} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={gap}
                    onChange={(e) => setGap(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-primary-500"
                  />
                </div>

                {/* Auto Align Trigger */}
                {images && images.length > 1 && (
                  <div className="pt-2 pb-1">
                    <button
                      onClick={onAutoStitchTrigger}
                      className="w-full bg-linear-to-r from-primary-600 to-primary-400 hover:from-primary-700 hover:to-primary-500 text-white font-medium py-2 px-3 rounded-lg shadow-sm transition-all duration-200 text-xs flex items-center justify-center gap-1"
                    >
                      ✨ 智能自动对齐 (Auto Align)
                    </button>
                  </div>
                )}

                {/* Manual overlaps */}
                {overlaps.length > 0 && direction === 'vertical' && (
                  <div className="space-y-3 pt-2">
                    <label className="text-xs font-bold text-gray-400 block border-b border-dark-700/40 pb-1">
                      接缝重叠微调 (Overlap Fine-Tuning)
                    </label>
                    <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                      {overlaps.map((val, idx) => (
                        <div key={idx} className="space-y-1.5 bg-dark-850 p-2.5 rounded-lg border border-dark-700/35">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-gray-400 font-medium truncate max-w-[170px]">
                              连接点 {idx + 1}: {imageNames[idx]} ⬇️ {imageNames[idx + 1]}
                            </span>
                            <span className="text-primary-300 font-mono font-bold">{val} px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="500"
                            value={val}
                            onChange={(e) => updateOverlap(idx, parseInt(e.target.value))}
                            className="w-full h-1 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. Cut Tab */}
            {activeTab === 'cut' && (
              <div className="space-y-4">
                <div className="bg-primary-500/10 border border-primary-500/20 p-3 rounded-xl text-xs text-primary-200 space-y-2">
                  <p className="font-semibold">使用指南：</p>
                  <ol className="list-decimal list-inside text-gray-400 leading-relaxed space-y-1.5">
                    <li>点击下方 <b>“放置水平/垂直分割线”</b>。</li>
                    <li>在图片需要切开的相对位置<b>点击一次</b>，画面将被切开。</li>
                    <li>
                      结束分割线模式后，在图片边缘附近<b>按住左键拖拽</b>：
                      <ul className="list-disc list-inside pl-4 text-gray-500 mt-1">
                        <li><b>靠近上/下边缘拖拽</b>：进行上下裁剪</li>
                        <li><b>靠近左/右边缘拖拽</b>：进行左右裁剪</li>
                      </ul>
                    </li>
                  </ol>
                </div>

                {/* Split Action Select */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400">选择裁剪线工具</label>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setSelectedTool('cut-horizontal')}
                      aria-pressed={selectedTool === 'cut-horizontal'}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none ${
                        selectedTool === 'cut-horizontal'
                          ? 'bg-red-600 border-red-500 text-white shadow-md'
                          : 'bg-dark-800 border-dark-700/60 text-gray-400 hover:bg-dark-700'
                      }`}
                    >
                      <Split className="w-3.5 h-3.5 rotate-90" />
                      放置水平分割线 (Horizontal Split)
                    </button>

                    <button
                      onClick={() => setSelectedTool('cut-vertical')}
                      aria-pressed={selectedTool === 'cut-vertical'}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none ${
                        selectedTool === 'cut-vertical'
                          ? 'bg-blue-600 border-blue-500 text-white shadow-md'
                          : 'bg-dark-800 border-dark-700/60 text-gray-400 hover:bg-dark-700'
                      }`}
                    >
                      <Split className="w-3.5 h-3.5" />
                      放置垂直分割线 (Vertical Split)
                    </button>
                    
                    <button
                      onClick={() => setSelectedTool('select')}
                      aria-pressed={selectedTool === 'select'}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none ${
                        selectedTool === 'select'
                          ? 'bg-primary-600 border-primary-500 text-white shadow-md'
                          : 'bg-dark-800 border-dark-700/60 text-gray-400 hover:bg-dark-700'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      结束分割，进入拖拽裁剪模式
                    </button>
                  </div>
                </div>

                {/* Reset button */}
                {onResetCropsAndSplits && (
                  <button
                    onClick={() => {
                      if (window.confirm("确定要重置所有裁剪与分割吗？")) {
                        onResetCropsAndSplits();
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/30 text-xs font-semibold rounded-lg transition mt-4"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    重置所有裁剪与分割
                  </button>
                )}
              </div>
            )}

            {/* 3. Markup Tab */}
            {activeTab === 'markup' && (
              <div className="space-y-4">
                {/* Tools */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400">标注工具</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['select', 'pen', 'arrow', 'rect', 'text', 'blur'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setSelectedTool(t)}
                        aria-pressed={selectedTool === t}
                        className={`py-2 px-1 rounded-lg text-xs font-semibold border capitalize transition focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none ${
                          selectedTool === t
                            ? 'bg-primary-600 border-primary-500 text-white shadow-md'
                            : 'bg-dark-800 border-dark-700/60 text-gray-400 hover:bg-dark-700'
                        }`}
                      >
                        {t === 'select' ? '选择模式' : t === 'pen' ? '自由画笔' : t === 'rect' ? '矩形框' : t === 'arrow' ? '箭头' : t === 'text' ? '添加文字' : '模糊马赛克'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Colors */}
                {selectedTool !== 'select' && selectedTool !== 'blur' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 block">边框/字体颜色</label>
                    <div className="flex gap-2.5 flex-wrap">
                      {colors.map((c) => (
                        <button
                          key={c}
                          onClick={() => setColor(c)}
                          style={{ backgroundColor: c }}
                          aria-label={`选择颜色 ${c}`}
                          aria-pressed={color === c}
                          className={`w-6 h-6 rounded-full border flex items-center justify-center shadow-inner transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900 focus:outline-none ${
                            color === c ? 'border-primary-300 scale-105' : 'border-dark-700'
                          }`}
                        >
                          {color === c && (
                            <Check className={`w-3.5 h-3.5 ${c === '#ffffff' || c === '#ffcc00' ? 'text-black' : 'text-white'}`} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Size Controls */}
                {selectedTool !== 'select' && selectedTool !== 'cut-horizontal' && selectedTool !== 'cut-vertical' && (
                  <div className="space-y-3">
                    {selectedTool !== 'text' ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-gray-400 font-semibold">
                          <span>线条粗细</span>
                          <span>{strokeWidth} px</span>
                        </div>
                        <input
                          type="range"
                          min="2"
                          max="20"
                          value={strokeWidth}
                          onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                          className="w-full h-1 bg-dark-800 rounded accent-primary-500"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-gray-400 font-semibold">
                          <span>字号大小</span>
                          <span>{fontSize} px</span>
                        </div>
                        <input
                          type="range"
                          min="12"
                          max="72"
                          value={fontSize}
                          onChange={(e) => setFontSize(parseInt(e.target.value))}
                          className="w-full h-1 bg-dark-800 rounded accent-primary-500"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* History Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-dark-700/50">
                  <div className="flex gap-2">
                    <button
                      onClick={onUndo}
                      disabled={!canUndo}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-dark-800 hover:bg-dark-700 text-gray-300 disabled:text-gray-600 disabled:hover:bg-dark-800 text-xs font-semibold rounded-lg border border-dark-750 transition"
                    >
                      <Undo className="w-3.5 h-3.5" />
                      撤销
                    </button>
                    <button
                      onClick={onRedo}
                      disabled={!canRedo}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-dark-800 hover:bg-dark-700 text-gray-300 disabled:text-gray-600 disabled:hover:bg-dark-800 text-xs font-semibold rounded-lg border border-dark-750 transition"
                    >
                      <Redo className="w-3.5 h-3.5" />
                      重做
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm("确定要清除所有标注吗？")) {
                        onClearAnnotations();
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/30 text-xs font-semibold rounded-lg transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    清除所有标注
                  </button>
                </div>
              </div>
            )}

            {/* 4. Status Bar Tab */}
            {activeTab === 'statusbar' && (
              <div className="space-y-4">
                {/* Toggle Enable */}
                <label className="flex justify-between items-center bg-dark-800/40 p-2.5 rounded-lg border border-dark-700/40 cursor-pointer hover:bg-dark-800/60 transition">
                  <span className="text-xs font-bold text-gray-300">状态栏美化覆盖</span>
                  <input
                    type="checkbox"
                    checked={statusBar.enabled}
                    onChange={(e) => setStatusBar({ ...statusBar, enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-primary-500 bg-dark-900 border-dark-700 focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none accent-primary-500"
                  />
                </label>

                {statusBar.enabled && (
                  <div className="space-y-4 animate-fade-in">
                    {/* Time Input */}
                    <div className="space-y-1.5">
                      <label htmlFor="statusBarTime" className="text-xs font-bold text-gray-400 cursor-pointer">时间文本</label>
                      <input
                        id="statusBarTime"
                        type="text"
                        maxLength={10}
                        value={statusBar.time}
                        onChange={(e) => setStatusBar({ ...statusBar, time: e.target.value })}
                        className="w-full bg-dark-800 border border-dark-700 rounded-lg py-1.5 px-3 text-xs text-gray-200 focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none font-mono"
                        placeholder="9:41"
                      />
                    </div>

                    {/* Battery Slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-gray-400 font-bold">
                        <span>电量比例</span>
                        <span className="text-primary-300 font-mono">{statusBar.battery}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={statusBar.battery}
                        onChange={(e) => setStatusBar({ ...statusBar, battery: parseInt(e.target.value) })}
                        className="w-full h-1 bg-dark-800 rounded accent-primary-500"
                      />
                    </div>

                    {/* Signal Network */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400">网络连接</label>
                      <div className="flex gap-2">
                        {(['wifi', 'cellular', 'none'] as const).map((net) => (
                          <button
                            key={net}
                            onClick={() => setStatusBar({ ...statusBar, wifi: net })}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                              statusBar.wifi === net
                                ? 'bg-primary-600 text-white'
                                : 'bg-dark-800 text-gray-400 border border-dark-700/50'
                            }`}
                          >
                            {net === 'wifi' ? 'Wi-Fi' : net === 'cellular' ? '蜂窝网' : '无'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Status bar text style */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400">图标与文字颜色</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setStatusBar({ ...statusBar, style: 'light' })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                            statusBar.style === 'light'
                              ? 'bg-primary-600 text-white'
                              : 'bg-dark-800 text-gray-400 border border-dark-700/50'
                          }`}
                        >
                          白色 (深背景用)
                        </button>
                        <button
                          onClick={() => setStatusBar({ ...statusBar, style: 'dark' })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                            statusBar.style === 'dark'
                              ? 'bg-primary-600 text-white'
                              : 'bg-dark-800 text-gray-400 border border-dark-700/50'
                          }`}
                        >
                          黑色 (浅背景用)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. Mockups Tab */}
            {activeTab === 'mockup' && (
              <div className="space-y-4">
                {/* Select Device */}
                <div className="space-y-1.5">
                  <label htmlFor="mockupDevice" className="text-xs font-bold text-gray-400 cursor-pointer">套壳机型</label>
                  <select
                    id="mockupDevice"
                    value={mockup.device}
                    onChange={(e) => setMockup({ ...mockup, device: e.target.value as any })}
                    className="w-full bg-dark-800 border border-dark-700 rounded-lg py-1.5 px-3 text-xs text-gray-200 focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                  >
                    <option value="none">无套壳</option>
                    <option value="iphone15">iPhone 15 Pro (灵动岛)</option>
                    <option value="iphone14">iPhone 14 (刘海屏)</option>
                    <option value="ipad">iPad Pro (平板边框)</option>
                  </select>
                </div>

                {mockup.device !== 'none' && (
                  <div className="space-y-4 animate-fade-in">
                    {/* Extend Bottom Mode */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400">套壳布局模式</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setMockup({ ...mockup, extendBottom: true })}
                          className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-semibold leading-4 transition ${
                            mockup.extendBottom
                              ? 'bg-primary-600 text-white'
                              : 'bg-dark-800 text-gray-400 border border-dark-700/50 hover:bg-dark-700'
                          }`}
                        >
                          无限延伸 ( scrolling 长图适用 )
                        </button>
                        <button
                          onClick={() => setMockup({ ...mockup, extendBottom: false })}
                          className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-semibold leading-4 transition ${
                            !mockup.extendBottom
                              ? 'bg-primary-600 text-white'
                              : 'bg-dark-800 text-gray-400 border border-dark-700/50 hover:bg-dark-700'
                          }`}
                        >
                          标准裁剪 ( 裁至标准手机比例 )
                        </button>
                      </div>
                    </div>

                    {/* Background Type */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400">套壳背景样式</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['gradient', 'solid', 'blur'] as const).map((bg) => (
                          <button
                            key={bg}
                            onClick={() => setMockup({ ...mockup, bgColorType: bg })}
                            className={`py-1.5 rounded-lg text-xs font-semibold transition ${
                              mockup.bgColorType === bg
                                ? 'bg-primary-600 text-white'
                                : 'bg-dark-800 text-gray-400 border border-dark-700/50'
                            }`}
                          >
                            {bg === 'gradient' ? '多彩渐变' : bg === 'solid' ? '纯色' : '截图毛玻璃'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Background settings based on type */}
                    {mockup.bgColorType === 'solid' && (
                      <div className="space-y-1.5 bg-dark-850 p-2 rounded-lg border border-dark-700/40">
                        <label className="text-[11px] text-gray-400 font-semibold block">选择背景纯色</label>
                        <input
                          type="color"
                          value={mockup.bgSolid}
                          onChange={(e) => setMockup({ ...mockup, bgSolid: e.target.value })}
                          className="w-full h-8 bg-transparent border-0 rounded cursor-pointer mt-1"
                        />
                      </div>
                    )}

                    {mockup.bgColorType === 'gradient' && (
                      <div className="grid grid-cols-2 gap-2 bg-dark-850 p-2 rounded-lg border border-dark-700/40">
                        <div>
                          <label className="text-[11px] text-gray-400 font-semibold">渐变起点</label>
                          <input
                            type="color"
                            value={mockup.bgGradientStart}
                            onChange={(e) => setMockup({ ...mockup, bgGradientStart: e.target.value })}
                            className="w-full h-8 bg-transparent border-0 rounded cursor-pointer mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-400 font-semibold">渐变终点</label>
                          <input
                            type="color"
                            value={mockup.bgGradientEnd}
                            onChange={(e) => setMockup({ ...mockup, bgGradientEnd: e.target.value })}
                            className="w-full h-8 bg-transparent border-0 rounded cursor-pointer mt-1"
                          />
                        </div>
                      </div>
                    )}

                    {/* Padding slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-gray-400 font-bold">
                        <span>套壳边距 (Padding)</span>
                        <span className="text-primary-300 font-mono">{mockup.padding} px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="120"
                        value={mockup.padding}
                        onChange={(e) => setMockup({ ...mockup, padding: parseInt(e.target.value) })}
                        className="w-full h-1 bg-dark-800 rounded accent-primary-500"
                      />
                    </div>

                    {/* Shadow toggle */}
                    <label className="flex justify-between items-center bg-dark-800/40 p-2.5 rounded-lg border border-dark-700/40 cursor-pointer hover:bg-dark-800/60 transition">
                      <span className="text-xs font-bold text-gray-300">立体设备阴影</span>
                      <input
                        type="checkbox"
                        checked={mockup.shadow}
                        onChange={(e) => setMockup({ ...mockup, shadow: e.target.checked })}
                        className="w-4 h-4 rounded focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none accent-primary-500"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* 6. Export Tab */}
            {activeTab === 'export' && (
              <div className="space-y-4">
                {/* Format selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400">导出格式</label>
                  <div className="flex gap-2">
                    {(['png', 'jpeg'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setExportConfig({ ...exportConfig, format: fmt })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                          exportConfig.format === fmt
                            ? 'bg-primary-600 text-white'
                            : 'bg-dark-800 text-gray-400 border border-dark-700/50'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality control for JPEG */}
                {exportConfig.format === 'jpeg' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-400 font-bold">
                      <span>JPEG 压缩质量</span>
                      <span className="text-primary-300 font-mono">{Math.round(exportConfig.quality * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.4"
                      max="1.0"
                      step="0.05"
                      value={exportConfig.quality}
                      onChange={(e) => setExportConfig({ ...exportConfig, quality: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-dark-800 rounded accent-primary-500"
                    />
                  </div>
                )}

                {/* Slicing options */}
                <div className="space-y-2 border-t border-dark-700/50 pt-3">
                  <label className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                    <Split className="w-3.5 h-3.5 text-primary-400" />
                    长图分割切片 (Slicing)
                  </label>
                  <div className="space-y-1.5 bg-dark-850 p-2.5 rounded-lg border border-dark-700/40">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <label htmlFor="exportScale" className="cursor-pointer">等高切片高度 (0 = 不分切)</label>
                      <span className="text-primary-300 font-mono">{exportConfig.scale === 0 ? '不切' : `${exportConfig.scale} px`}</span>
                    </div>
                    <input
                      id="exportScale"
                      type="number"
                      value={exportConfig.scale}
                      onChange={(e) => setExportConfig({ ...exportConfig, scale: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="w-full bg-dark-800 border border-dark-700 rounded-md py-1.5 px-2.5 text-xs text-gray-200 mt-1 focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none font-mono"
                      placeholder="例如 1200"
                    />
                  </div>
                </div>

                {/* PDF settings */}
                <div className="space-y-2 border-t border-dark-700/50 pt-3">
                  <label className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-primary-400" />
                    PDF 文档设置
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExportConfig({ ...exportConfig, pdfPageMode: 'single' })}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold leading-4 transition ${
                        exportConfig.pdfPageMode === 'single'
                          ? 'bg-primary-600 text-white'
                          : 'bg-dark-800 text-gray-400 border border-dark-700/50'
                      }`}
                    >
                      单页长图 PDF
                    </button>
                    <button
                      onClick={() => setExportConfig({ ...exportConfig, pdfPageMode: 'multi' })}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold leading-4 transition ${
                        exportConfig.pdfPageMode === 'multi'
                          ? 'bg-primary-600 text-white'
                          : 'bg-dark-800 text-gray-400 border border-dark-700/50'
                      }`}
                    >
                      自动分页 (A4 比例)
                    </button>
                  </div>
                </div>

                {/* Main downloads */}
                <div className="space-y-2.5 pt-4 border-t border-dark-700/60">
                  <button
                    onClick={onDownloadImage}
                    className="w-full flex items-center justify-center gap-2 bg-linear-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white font-medium py-2 px-4 rounded-xl shadow-lg transition duration-200 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    下载长截图图片
                  </button>

                  <button
                    onClick={onDownloadPDF}
                    className="w-full flex items-center justify-center gap-2 bg-dark-800 hover:bg-dark-750 text-gray-200 font-medium py-2 px-4 rounded-xl border border-dark-700 transition duration-200 text-sm"
                  >
                    <FileText className="w-4 h-4 text-orange-400" />
                    导出 PDF 电子书
                  </button>

                  {exportConfig.scale > 0 && (
                    <button
                      onClick={onDownloadZip}
                      className="w-full flex items-center justify-center gap-2 bg-dark-800 hover:bg-dark-750 text-gray-200 font-medium py-2 px-4 rounded-xl border border-dark-700 transition duration-200 text-sm animate-pulse"
                    >
                      <Split className="w-4 h-4 text-green-400" />
                      打包下载分段切片 (.zip)
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
