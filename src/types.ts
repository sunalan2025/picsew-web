export interface StitchedImage {
  id: string;
  name: string;
  src: string; // base64 or object URL
  width: number;
  height: number;
  cropTop: number;     // pixels to crop from top
  cropBottom: number;  // pixels to crop from bottom
  cropLeft: number;    // pixels to crop from left
  cropRight: number;   // pixels to crop from right
  originalId?: string; // original image ID if split
}

export type AnnotationType = 'pen' | 'arrow' | 'rect' | 'text' | 'blur';

export interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  color: string;
  strokeWidth: number;
}

export interface PenAnnotation extends BaseAnnotation {
  type: 'pen';
  points: { x: number; y: number }[];
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface RectAnnotation extends BaseAnnotation {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface BlurAnnotation extends BaseAnnotation {
  type: 'blur';
  x: number;
  y: number;
  width: number;
  height: number;
  blurType: 'pixel' | 'blur';
}

export type Annotation =
  | PenAnnotation
  | ArrowAnnotation
  | RectAnnotation
  | TextAnnotation
  | BlurAnnotation;

export interface StatusBarConfig {
  enabled: boolean;
  time: string;
  battery: number; // 0 to 100
  wifi: 'wifi' | 'cellular' | 'none';
  style: 'light' | 'dark'; // light text (dark bg) or dark text (light bg)
}

export interface MockupConfig {
  device: 'none' | 'iphone15' | 'iphone14' | 'ipad';
  bgColorType: 'gradient' | 'solid' | 'blur';
  bgGradientStart: string;
  bgGradientEnd: string;
  bgSolid: string;
  padding: number; // gap between device frame and canvas border
  shadow: boolean;
  extendBottom: boolean; // if true, the screen is open at the bottom (scrolling screenshots)
}

export interface ExportConfig {
  format: 'png' | 'jpeg' | 'pdf';
  quality: number; // 0.1 to 1.0 (for jpeg)
  scale: number; // 1 = original, 2 = 2x, etc.
  pdfPageMode: 'single' | 'multi'; // single long page or split pages
}
