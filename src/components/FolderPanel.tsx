import { useMemo } from 'react';
import {
  filterPairs,
  folderStats,
  pairStatusLabel,
  type FilePair,
  type PairFilter,
} from '../core/folder';
import type { Side } from '../core/types';
import { formatBytes } from '../fs/fileAccess';
import type { FolderPhase } from '../hooks/useFolderCompare';

/**
 * 一次最多渲染多少行。
 *
 * 目录清单不像差异视图那样有固定行高，做虚拟滚动收益不大；两万文件的目录
 * 里真正有差异的通常几十上百个，超出部分让用户用关键字筛。
 */
const MAX_VISIBLE_ROWS = 1000;

interface FolderPanelProps {
  names: Record<Side, string | null>;
  pairs: FilePair[];
  phase: FolderPhase;
  progress: string | null;
  warnings: string[];
  filter: PairFilter;
  supported: boolean;
  activePath: string | null;
  onFilter: (patch: Partial<PairFilter>) => void;
  onPick: (side: Side) => void;
  onOpenPair: (pair: FilePair) => void;
  onRescan: () => void;
  onClose: () => void;
}

/** 文件夹对比结果列表。点某一行把该对文件载入差异视图。 */
export function FolderPanel({
  names,
  pairs,
  phase,
  progress,
  warnings,
  filter,
  supported,
  activePath,
  onFilter,
  onPick,
  onOpenPair,
  onRescan,
  onClose,
}: FolderPanelProps) {
  const stats = useMemo(() => folderStats(pairs), [pairs]);
  const visible = useMemo(() => filterPairs(pairs, filter), [pairs, filter]);
  const shown = visible.slice(0, MAX_VISIBLE_ROWS);
  const busy = phase === 'scanning' || phase === 'comparing';

  return (
    <div className="folder-panel">
      <div className="folder-roots">
        {(['left', 'right'] as const).map((side) => (
          <div className="folder-root" key={side}>
            <span className="side-badge">{side === 'left' ? '左侧' : '右侧'}</span>
            <span className="name-text" title={names[side] ?? undefined}>
              {names[side] ?? '未选择文件夹'}
            </span>
            <button type="button" onClick={() => onPick(side)} disabled={!supported || busy}>
              {names[side] ? '更换' : '选择文件夹'}
            </button>
          </div>
        ))}
      </div>

      {warnings.map((text) => (
        <div className="banner banner-warn" key={text}>
          {text}
        </div>
      ))}

      <div className="folder-bar">
        <div className="toolbar-group stats" aria-label="文件夹对比统计">
          <span className="stat stat-conflict" title="两侧都有但内容不同">
            不同 {stats.different}
          </span>
          <span className="stat stat-delete" title="仅左侧存在">
            仅左 {stats.leftOnly}
          </span>
          <span className="stat stat-insert" title="仅右侧存在">
            仅右 {stats.rightOnly}
          </span>
          <span className="stat" title="两侧内容一致">
            一致 {stats.same}
          </span>
        </div>

        <div className="toolbar-group">
          <label>
            <input
              type="checkbox"
              checked={filter.showSame}
              onChange={(e) => onFilter({ showSame: e.target.checked })}
            />
            显示一致文件
          </label>
          <label>
            <input
              type="checkbox"
              checked={filter.showOnlyOneSide}
              onChange={(e) => onFilter({ showOnlyOneSide: e.target.checked })}
            />
            显示单侧文件
          </label>
        </div>

        <div className="toolbar-group">
          <input
            type="search"
            className="folder-search"
            placeholder="筛选路径"
            aria-label="按路径筛选"
            value={filter.keyword}
            onChange={(e) => onFilter({ keyword: e.target.value })}
          />
          <button type="button" onClick={onRescan} disabled={busy || !names.left || !names.right}>
            重新扫描
          </button>
          <button type="button" onClick={onClose} title="关闭文件夹对比">
            关闭
          </button>
        </div>

        <span className="counter" aria-live="polite" aria-atomic="true">
          {progress ?? `${visible.length} / ${stats.total} 个文件`}
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="empty-state">
          <p>{emptyText(names, phase, stats.total)}</p>
          {!names.left && !names.right && (
            <p className="empty-hint">两侧各选一个文件夹，按相对路径逐一对比。</p>
          )}
        </div>
      ) : (
        <div className="folder-list" role="list">
          {shown.map((pair) => (
            <button
              type="button"
              role="listitem"
              key={pair.path}
              className={`folder-row folder-row-${pair.status}${
                pair.path === activePath ? ' folder-row-active' : ''
              }`}
              onClick={() => onOpenPair(pair)}
              title={`打开 ${pair.path}`}
            >
              <span className={`folder-status folder-status-${pair.status}`}>
                {pairStatusLabel(pair.status)}
              </span>
              <span className="folder-path">{pair.path}</span>
              <span className="folder-size">{sizeText(pair)}</span>
            </button>
          ))}
          {visible.length > shown.length && (
            <div className="folder-more">
              还有 {visible.length - shown.length} 个文件未显示，用上方关键字继续筛选。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function emptyText(
  names: Record<Side, string | null>,
  phase: FolderPhase,
  total: number,
): string {
  if (!names.left || !names.right) return '请为两侧各选择一个文件夹。';
  if (phase === 'scanning' || phase === 'comparing') return '正在处理…';
  if (total === 0) return '两个文件夹里没有可对比的文件（可能都被忽略规则跳过了）。';
  return '当前筛选条件下没有文件，试试勾选「显示一致文件」。';
}

/** 大小列文案：两侧不同时都显示，相同时只显示一个。 */
function sizeText(pair: FilePair): string {
  const left = pair.left ? formatBytes(pair.left.size) : '—';
  const right = pair.right ? formatBytes(pair.right.size) : '—';
  return left === right ? left : `${left} → ${right}`;
}
