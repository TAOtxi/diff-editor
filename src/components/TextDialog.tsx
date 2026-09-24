import { useEffect, useRef, useState } from 'react';

interface TextDialogProps {
  title: string;
  initialValue: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * 文本输入对话框，用于「粘贴文本」与「整篇编辑」。
 *
 * 整篇编辑走这里而不是就地编辑整个面板，是为了不和虚拟滚动冲突：
 * 虚拟滚动只渲染视口内的行，就地编辑整篇会丢失未渲染部分的编辑状态。
 */
export function TextDialog({
  title,
  initialValue,
  confirmLabel,
  onConfirm,
  onCancel,
}: TextDialogProps) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-title">{title}</div>
        <textarea
          ref={ref}
          className="dialog-textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // 对话框内不让快捷键冒泡到全局
            e.stopPropagation();
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onConfirm(value);
          }}
          spellCheck={false}
          aria-label={title}
        />
        <div className="dialog-actions">
          <span className="dialog-hint">Cmd+Enter 确认，Esc 取消</span>
          <button type="button" className="ghost-btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="primary-btn" onClick={() => onConfirm(value)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
