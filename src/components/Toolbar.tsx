import type { DiffStats } from '../core/types';

interface ToolbarProps {
  stats: DiffStats;
  position: number;
  total: number;
  computing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  optionsOpen: boolean;
  onPrev: () => void;
  onNext: () => void;
  onFirst: () => void;
  onLast: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleOptions: () => void;
  onSwap: () => void;
  onTakeAllLeft: () => void;
  onTakeAllRight: () => void;
}

export function Toolbar({
  stats,
  position,
  total,
  computing,
  canUndo,
  canRedo,
  optionsOpen,
  onPrev,
  onNext,
  onFirst,
  onLast,
  onUndo,
  onRedo,
  onToggleOptions,
  onSwap,
  onTakeAllLeft,
  onTakeAllRight,
}: ToolbarProps) {
  const counter = total === 0 ? '无差异' : `第 ${position + 1} / ${total} 个差异`;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button type="button" onClick={onFirst} disabled={total === 0} title="首个差异 (Alt+Home)">
          ⤒
        </button>
        <button type="button" onClick={onPrev} disabled={total === 0} title="上一个差异 (Alt+↑)">
          ↑
        </button>
        <button type="button" onClick={onNext} disabled={total === 0} title="下一个差异 (Alt+↓)">
          ↓
        </button>
        <button type="button" onClick={onLast} disabled={total === 0} title="末个差异 (Alt+End)">
          ⤓
        </button>
        <span className="counter" aria-live="polite" aria-atomic="true">
          {computing ? '计算中…' : counter}
        </span>
      </div>

      <div className="toolbar-group stats" aria-label="差异统计">
        <span className="stat stat-delete" title="仅左侧存在">
          − {stats.deleteBlocks}
        </span>
        <span className="stat stat-insert" title="仅右侧存在">
          + {stats.insertBlocks}
        </span>
        <span className="stat stat-conflict" title="双边都改（冲突）">
          ± {stats.conflictBlocks}
        </span>
      </div>

      <div className="toolbar-group">
        <button type="button" onClick={onUndo} disabled={!canUndo} title="撤销 (Cmd+Z)">
          撤销
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="重做 (Cmd+Shift+Z)">
          重做
        </button>
      </div>

      <div className="toolbar-group">
        <button type="button" onClick={onTakeAllLeft} disabled={total === 0} title="全部采用左侧">
          全采用左
        </button>
        <button type="button" onClick={onTakeAllRight} disabled={total === 0} title="全部采用右侧">
          全采用右
        </button>
        <button type="button" onClick={onSwap} title="交换两侧文档">
          交换
        </button>
        <button
          type="button"
          onClick={onToggleOptions}
          aria-expanded={optionsOpen}
          title="对比选项"
        >
          选项
        </button>
      </div>
    </div>
  );
}
