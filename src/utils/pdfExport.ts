export interface PdfPlan {
  mode: 'single' | 'multi';
  widthPt: number;
  heightPt: number;
  pageHeightPx: number;
  count: number;
}
const A4_W = 595.28;
const A4_H = 841.89;
const MAX_SINGLE_H = 14000;
const MAX_PAGES = 160;

export function planPdfExport(
  width: number,
  height: number,
  requested: 'single' | 'multi',
  ppi = 0
): PdfPlan {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('画布尺寸无效，无法导出 PDF');
  }
  if (!Number.isFinite(ppi) || ppi < 0) throw new Error('PDF PPI 无效');
  const widthPt = ppi ? (width * 72) / ppi : A4_W;
  const scaledHeight = (height / width) * widthPt;
  if (
    requested === 'single' &&
    scaledHeight <= MAX_SINGLE_H &&
    widthPt <= MAX_SINGLE_H
  ) {
    return {
      mode: 'single',
      widthPt,
      heightPt: scaledHeight,
      pageHeightPx: height,
      count: 1,
    };
  }
  const pageHeightPx = Math.max(1, Math.floor((width * A4_H) / A4_W));
  const count = Math.ceil(height / pageHeightPx);
  if (count > MAX_PAGES) {
    throw new Error(`PDF 需要 ${count} 页，超出导出上限；请使用分段导出。`);
  }
  return { mode: 'multi', widthPt: A4_W, heightPt: A4_H, pageHeightPx, count };
}
