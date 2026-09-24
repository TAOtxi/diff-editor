import { useRef } from 'react';
import type { DocumentState } from '../state/store';
import type { Side } from '../core/types';

interface FileHeaderProps {
  side: Side;
  doc: DocumentState;
  supported: boolean;
  onPick: (side: Side) => void;
  onDropFile: (side: Side, file: File) => void;
  onPasteText: (side: Side) => void;
  onSave: (side: Side) => void;
  onSaveAs: (side: Side) => void;
  onEditAll: (side: Side) => void;
}

/**
 * 单侧文件头：文件名、脏标记与读写操作。
 *
 * 拖拽放入也在这里处理，落区覆盖整个头部，比只让按钮可点更好用。
 */
export function FileHeader({
  side,
  doc,
  supported,
  onPick,
  onDropFile,
  onPasteText,
  onSave,
  onSaveAs,
  onEditAll,
}: FileHeaderProps) {
  const dragDepth = useRef(0);
  const label = side === 'left' ? '左侧' : '右侧';

  return (
    <div
      className="file-header"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        e.currentTarget.classList.add('drag-over');
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) e.currentTarget.classList.remove('drag-over');
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        e.currentTarget.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) onDropFile(side, file);
      }}
    >
      <div className="file-name" title={doc.name}>
        <span className="side-badge">{label}</span>
        <span className="name-text">{doc.name}</span>
        {doc.dirty && (
          <span className="dirty-dot" title="有未保存的改动" aria-label="有未保存的改动">
            •
          </span>
        )}
        <span className="line-count">{doc.lines.length} 行</span>
      </div>

      <div className="file-actions">
        <button type="button" onClick={() => onPick(side)} disabled={!supported} title="打开文件">
          打开
        </button>
        <button type="button" onClick={() => onPasteText(side)} title="粘贴文本">
          粘贴
        </button>
        <button type="button" onClick={() => onEditAll(side)} title="整篇编辑">
          编辑
        </button>
        <button
          type="button"
          onClick={() => onSave(side)}
          disabled={!doc.dirty || !doc.hasHandle}
          title={doc.hasHandle ? '写回原文件 (Cmd+S)' : '尚未绑定文件，请用另存为'}
        >
          保存
        </button>
        <button type="button" onClick={() => onSaveAs(side)} disabled={!supported} title="另存为">
          另存为
        </button>
      </div>
    </div>
  );
}
