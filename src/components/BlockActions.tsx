import { availableOperations, operationLabel } from '../core/operations';
import type { BlockOperation, DiffBlock } from '../core/types';

interface BlockActionsProps {
  block: DiffBlock;
  onApply: (block: DiffBlock, operation: BlockOperation) => void;
  active: boolean;
}

/** 操作对应的简短符号，用于窄中缝按钮。 */
const SYMBOLS: Record<BlockOperation, string> = {
  takeLeft: '→',
  takeRight: '←',
  keepBoth: '⇄',
  deleteBoth: '✕',
};

/**
 * 差异块中缝的操作按钮组。
 *
 * 箭头方向表示内容流向：takeLeft 是把左侧内容推到右侧，所以显示 →。
 */
export function BlockActions({ block, onApply, active }: BlockActionsProps) {
  const operations = availableOperations(block.kind);
  if (operations.length === 0) return <div className="block-actions" />;

  return (
    <div className={`block-actions${active ? ' block-actions-active' : ''}`}>
      {operations.map((op) => {
        const label = operationLabel(block.kind, op);
        return (
          <button
            key={op}
            type="button"
            className={`action-btn action-${op}`}
            onClick={() => onApply(block, op)}
            title={label}
            aria-label={`第 ${block.index + 1} 处差异：${label}`}
          >
            {SYMBOLS[op]}
          </button>
        );
      })}
    </div>
  );
}
