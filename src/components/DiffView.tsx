import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockActions } from './BlockActions';
import { LineCell } from './LineCell';
import type { Row } from '../view/rows';
import type { BlockOperation, DiffBlock, Side } from '../core/types';

/** 单行高度，px。固定行高换取简单可靠的虚拟滚动计算。 */
export const ROW_HEIGHT = 22;

/** 视口外额外渲染的行数，减少快速滚动时的白屏。 */
const OVERSCAN = 12;

interface DiffViewProps {
  rows: Row[];
  blocks: readonly DiffBlock[];
  leftLines: readonly string[];
  rightLines: readonly string[];
  activeBlock: number;
  onApply: (block: DiffBlock, operation: BlockOperation) => void;
  onEditLine: (side: Side, lineNumber: number, value: string) => void;
  onExpand: (blockIndex: number) => void;
  /** 需要滚动到的行下标，变化时触发滚动。 */
  scrollToRow: number | null;
}

export function DiffView({
  rows,
  blocks,
  leftLines,
  rightLines,
  activeBlock,
  onApply,
  onEditLine,
  onExpand,
  scrollToRow,
}: DiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  // 视口高度跟随容器尺寸变化
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setViewportHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  // 导航滚动：把目标行带到视口中部
  useEffect(() => {
    if (scrollToRow === null) return;
    const el = containerRef.current;
    if (!el) return;
    const target = Math.max(0, scrollToRow * ROW_HEIGHT - el.clientHeight / 2 + ROW_HEIGHT / 2);
    // 部分环境（含 jsdom）没有 scrollTo，退化为直接赋值
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: target, behavior: 'smooth' });
    } else {
      el.scrollTop = target;
    }
  }, [scrollToRow]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  const visible = useMemo(() => {
    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const count = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const last = Math.min(rows.length, first + count);
    return { first, last };
  }, [scrollTop, viewportHeight, rows.length]);

  /**
   * 某行是否是该块在可视范围内的第一行。
   * 操作按钮只在这一行渲染，避免每行都出现一组按钮；
   * 用「可视范围内的第一行」而非「块的第一行」，保证长块滚动后按钮依然可见。
   */
  const isBlockAnchor = useCallback(
    (row: Row, index: number): boolean => {
      if (row.kind === 'equal') return false;
      if (index === visible.first) return true;
      const prev = rows[index - 1];
      return !prev || prev.blockIndex !== row.blockIndex;
    },
    [rows, visible.first],
  );

  const blockByIndex = useMemo(() => {
    const map = new Map<number, DiffBlock>();
    for (const b of blocks) map.set(b.index, b);
    return map;
  }, [blocks]);

  const slice = rows.slice(visible.first, visible.last);

  return (
    <div className="diff-view" ref={containerRef} onScroll={handleScroll} tabIndex={0}>
      <div className="diff-spacer" style={{ height: rows.length * ROW_HEIGHT }}>
        {slice.map((row, i) => {
          const index = visible.first + i;
          const block = blockByIndex.get(row.blockIndex);
          const isActive = row.blockIndex === activeBlock;

          if (row.collapsed) {
            return (
              <div
                className="row row-collapsed"
                key={row.key}
                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                <button type="button" className="expand-btn" onClick={() => onExpand(row.blockIndex)}>
                  展开 {row.collapsed.count} 行相同内容
                </button>
              </div>
            );
          }

          return (
            <div
              className={`row row-${row.kind}${isActive ? ' row-active' : ''}`}
              key={row.key}
              style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
              data-block={row.blockIndex}
            >
              <div className="side side-left">
                <LineCell
                  lineNumber={row.leftLine}
                  text={row.leftLine !== null ? (leftLines[row.leftLine] ?? '') : null}
                  segments={row.inline?.left}
                  onCommit={(line, value) => onEditLine('left', line, value)}
                  editable
                />
              </div>

              <div className="middle">
                {block && isBlockAnchor(row, index) ? (
                  <BlockActions block={block} onApply={onApply} active={isActive} />
                ) : (
                  <div className="block-actions block-actions-spacer">
                    <span className="kind-mark">{kindMark(row.kind)}</span>
                  </div>
                )}
              </div>

              <div className="side side-right">
                <LineCell
                  lineNumber={row.rightLine}
                  text={row.rightLine !== null ? (rightLines[row.rightLine] ?? '') : null}
                  segments={row.inline?.right}
                  onCommit={(line, value) => onEditLine('right', line, value)}
                  editable
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 行类型符号，不依赖颜色传达信息（色盲可访问性）。 */
function kindMark(kind: Row['kind']): string {
  if (kind === 'delete') return '-';
  if (kind === 'insert') return '+';
  if (kind === 'conflict') return '±';
  return '';
}
