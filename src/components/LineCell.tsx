import { useEffect, useRef, useState } from 'react';
import { InlineText } from './InlineText';
import type { InlineSegment } from '../core/types';

interface LineCellProps {
  /** 行号，null 表示空占位行。 */
  lineNumber: number | null;
  text: string | null;
  segments: InlineSegment[] | undefined;
  /** 双击提交单行编辑。 */
  onCommit: (lineNumber: number, value: string) => void;
  editable: boolean;
}

/**
 * 单侧的一行。
 *
 * 双击进入单行编辑：Enter 提交，Esc 取消，失焦提交。
 * 这样常见的「改一个字」不必切换到整篇编辑模式。
 */
export function LineCell({ lineNumber, text, segments, onCommit, editable }: LineCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // 空占位行：该侧此处没有内容
  if (lineNumber === null || text === null) {
    return (
      <div className="cell cell-empty" aria-hidden="true">
        <span className="gutter" />
        <span className="line-text" />
      </div>
    );
  }

  const commit = (): void => {
    setEditing(false);
    if (draft !== text) onCommit(lineNumber, draft);
  };

  const startEditing = (): void => {
    if (!editable) return;
    setDraft(text);
    setEditing(true);
  };

  return (
    <div className="cell">
      <span className="gutter">{lineNumber + 1}</span>
      {editing ? (
        <input
          ref={inputRef}
          className="line-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
            e.stopPropagation();
          }}
          aria-label={`编辑第 ${lineNumber + 1} 行`}
        />
      ) : (
        <span
          className="line-content"
          onDoubleClick={startEditing}
          title={editable ? '双击编辑本行' : undefined}
        >
          <InlineText segments={segments} fallback={text} />
        </span>
      )}
    </div>
  );
}
