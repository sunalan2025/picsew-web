import type {
  Annotation,
  ExportConfig,
  MockupConfig,
  StatusBarConfig,
  StitchedImage,
  WatermarkConfig,
} from '../types';
export interface EditorProject {
  images: StitchedImage[];
  overlaps: number[];
  annotations: Annotation[];
  direction: 'vertical' | 'horizontal';
  gap: number;
  statusBar: StatusBarConfig;
  mockup: MockupConfig;
  watermark: WatermarkConfig;
  exportConfig: ExportConfig;
}
export function emptyProject(): EditorProject {
  return {
    images: [],
    overlaps: [],
    annotations: [],
    direction: 'vertical',
    gap: 0,
    statusBar: {
      enabled: false,
      time: '09:41',
      battery: 100,
      wifi: 'wifi',
      style: 'light',
    },
    mockup: {
      device: 'none',
      bgColorType: 'gradient',
      bgGradientStart: '#8b5cf6',
      bgGradientEnd: '#ec4899',
      bgSolid: '#18181b',
      padding: 40,
      shadow: true,
      extendBottom: true,
    },
    watermark: {
      enabled: false,
      text: 'Picsew Web',
      opacity: 0.18,
      angle: -25,
      size: 36,
      repeat: true,
      color: '#1e3a8a',
    },
    exportConfig: {
      format: 'png',
      quality: 0.9,
      scale: 0,
      pdfPageMode: 'single',
      width: 0,
    },
  };
}
export interface ProjectHistory {
  entries: EditorProject[];
  index: number;
}
export function pushProject(
  history: ProjectHistory,
  project: EditorProject
): ProjectHistory {
  const entries = history.entries.slice(0, history.index + 1);
  entries.push(structuredClone(project));
  if (entries.length > 51) entries.shift();
  return { entries, index: entries.length - 1 };
}
