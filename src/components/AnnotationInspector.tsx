import type { Annotation } from '../types';
import { annotationBounds, mapAnnotation } from '../utils/annotations';
export function AnnotationInspector({
  annotation,
  onChange,
  onDelete,
}: {
  annotation: Annotation;
  onChange: (a: Annotation) => void;
  onDelete: () => void;
}) {
  const bounds = annotationBounds(annotation);
  const move = (axis: 'x' | 'y', value: number) =>
    onChange(
      mapAnnotation(
        annotation,
        1,
        axis === 'x' ? value - bounds.left : 0,
        axis === 'y' ? value - bounds.top : 0
      )
    );
  return (
    <section
      className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3"
      aria-label="选中标注设置"
    >
      <p className="text-xs font-semibold">已选中标注 · 可在画布上拖动</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label>
          X
          <input
            aria-label="标注 X 坐标"
            type="number"
            value={Math.round(bounds.left)}
            onChange={(e) => move('x', Number(e.target.value))}
            className="w-full"
          />
        </label>
        <label>
          Y
          <input
            aria-label="标注 Y 坐标"
            type="number"
            value={Math.round(bounds.top)}
            onChange={(e) => move('y', Number(e.target.value))}
            className="w-full"
          />
        </label>
        <label>
          大小
          <input
            aria-label="标注宽度"
            type="number"
            min={1}
            value={Math.round(Math.max(1, bounds.right - bounds.left))}
            onChange={(e) => {
              const scale =
                Math.max(1, Number(e.target.value)) /
                Math.max(1, bounds.right - bounds.left);
              onChange(
                mapAnnotation(
                  annotation,
                  scale,
                  bounds.left * (1 - scale),
                  bounds.top * (1 - scale)
                )
              );
            }}
            className="w-full"
          />
        </label>
        <label>
          颜色
          <input
            aria-label="标注颜色"
            type="color"
            value={annotation.color}
            onChange={(e) => onChange({ ...annotation, color: e.target.value })}
          />
        </label>
      </div>
      {annotation.type === 'text' && (
        <textarea
          aria-label="修改标注文字"
          value={annotation.text}
          onChange={(e) => onChange({ ...annotation, text: e.target.value })}
          className="w-full"
        />
      )}
      <button
        type="button"
        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700"
        onClick={onDelete}
      >
        删除此标注
      </button>
    </section>
  );
}
