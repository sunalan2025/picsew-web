import { Check } from 'lucide-react';
type Stage = 'upload' | 'review' | 'save';
const steps: { id: Stage; label: string; short: string; hint: string }[] = [
  {
    id: 'upload',
    label: '添加截图',
    short: '添加',
    hint: '按阅读顺序选择截图，保留相邻截图的重复内容',
  },
  {
    id: 'review',
    label: '检查拼接',
    short: '检查',
    hint: '先看长图是否完整，需要时再裁剪或微调连接处',
  },
  {
    id: 'save',
    label: '保存图片',
    short: '保存',
    hint: '默认 PNG 清晰保存，其他格式放在更多保存选项里',
  },
];
export function QuickStart({
  stage,
  hasImages,
  onStep,
}: {
  stage: Stage;
  hasImages: boolean;
  onStep: (stage: Stage) => void;
}) {
  const active = steps.findIndex((step) => step.id === stage);
  return (
    <nav aria-label="三步完成长图" className="quick-start">
      {steps.map((step, index) => (
        <button
          key={step.id}
          type="button"
          disabled={!hasImages && index > 0}
          aria-current={index === active ? 'step' : undefined}
          title={step.hint}
          onClick={() => onStep(step.id)}
          className={index === active ? 'quick-step active' : 'quick-step'}
        >
          <span className="quick-step-number">
            {index < active ? <Check className="h-3.5 w-3.5" /> : index + 1}
          </span>
          <span>{step.label}</span>
        </button>
      ))}
    </nav>
  );
}
