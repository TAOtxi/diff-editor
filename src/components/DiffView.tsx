import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockActions } from './BlockActions';
import { LineCell } from './LineCell';
import type { Row } from '../view/rows';
import {
  FALLBACK_FONT_METRICS,
  MIDDLE_WIDTH,
  SIDE_CHROME,
  TAB_SIZE,
  maxVisualUnits,
  measureFont,
  uniformLayout,
  wrappedLayout,
  type FontMetrics,
  type RowLayout,
} from '../view/layout';
import type { BlockOperation, DiffBlock, Side } from '../core/types';
import type { HighlightLanguage, HighlightToken } from '../core/highlight';

/** 视口外额外渲染的行数，减少快速滚动时的白屏。 */
const OVERSCAN = 12;

/** 换行模式下每侧至少保留的字符列数，避免容器极窄时一行只放得下一个字。 */
const MIN_COLUMNS = 8;

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
  /** 两侧语法高亮结果（每行 token 数组），下标与文档行一致。 */
  leftHighlight: HighlightToken[][] | undefined;
  rightHighlight: HighlightToken[][] | undefined;
  leftLanguage: HighlightLanguage | undefined;
  rightLanguage: HighlightLanguage | undefined;
  /** 是否自动换行。关闭时长行横向滚动。 */
  wordWrap?: boolean;
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
  leftHighlight,
  rightHighlight,
  leftLanguage,
  rightLanguage,
  wordWrap = false,
}: DiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  // 首帧还没量到容器尺寸，先给个合理初值：宽度为 0 会让换行模式算出极端布局
  const [viewport, setViewport] = useState({ width: 900, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    setViewport({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  // 字体度量：挂载后实测一次即可，字体本身不会中途变
  const [metrics, setMetrics] = useState<FontMetrics>(FALLBACK_FONT_METRICS);
  useEffect(() => {
    setMetrics(measureFont(containerRef.current));
  }, []);
  const wideUnits = metrics.narrow > 0 ? metrics.wide / metrics.narrow : 2;

  const maxUnits = useMemo(
    () =>
      Math.max(
        maxVisualUnits(leftLines, TAB_SIZE, wideUnits),
        maxVisualUnits(rightLines, TAB_SIZE, wideUnits),
      ),
    [leftLines, rightLines, wideUnits],
  );

  /**
   * 不换行时把行撑到「最长行放得下」的宽度，横向滚动条由 .diff-view 的
   * overflow 提供。两侧要各放一份最长行，所以是 contentWidth * 2。
   */
  const contentWidth = SIDE_CHROME + Math.ceil(maxUnits * metrics.narrow) + 4;
  const rowWidth = wordWrap
    ? viewport.width
    : Math.max(viewport.width, contentWidth * 2 + MIDDLE_WIDTH);

  /** 换行时每侧一行能容纳的半角字符数。 */
  const columns = useMemo(() => {
    const sideWidth = (viewport.width - MIDDLE_WIDTH) / 2;
    return Math.max(MIN_COLUMNS, Math.floor((sideWidth - SIDE_CHROME) / metrics.narrow));
  }, [viewport.width, metrics.narrow]);

  const layout = useMemo<RowLayout>(
    () =>
      wordWrap
        ? wrappedLayout({
            rows,
            leftLines,
            rightLines,
            columns,
            rowWidth,
            tabSize: TAB_SIZE,
            wideUnits,
          })
        : uniformLayout(rows.length, rowWidth),
    [wordWrap, rows, leftLines, rightLines, columns, rowWidth, wideUnits],
  );

  // 定位要用最新布局，但不希望布局因编辑内容变化就触发一次滚动，所以走 ref
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // 导航滚动：把目标行带到视口中部
  useEffect(() => {
    if (scrollToRow === null) return;
    const el = containerRef.current;
    if (!el) return;
    const current = layoutRef.current;
    const target = Math.max(
      0,
      current.topOf(scrollToRow) - el.clientHeight / 2 + current.heightOf(scrollToRow) / 2,
    );
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
    if (rows.length === 0) return { first: 0, last: 0 };
    const firstIndex = layout.indexAt(scrollTop);
    const lastIndex = layout.indexAt(scrollTop + viewport.height);
    return {
      first: Math.max(0, firstIndex - OVERSCAN),
      last: Math.min(rows.length, lastIndex + 1 + OVERSCAN),
    };
  }, [layout, scrollTop, viewport.height, rows.length]);

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
    <div
      className={`diff-view${wordWrap ? ' wrap' : ''}`}
      ref={containerRef}
      onScroll={handleScroll}
      tabIndex={0}
    >
      <div
        className="diff-spacer"
        style={{ height: layout.totalHeight, width: layout.rowWidth }}
      >
        {slice.map((row, i) => {
          const index = visible.first + i;
          const block = blockByIndex.get(row.blockIndex);
          const isActive = row.blockIndex === activeBlock;
          const rowStyle = {
            top: layout.topOf(index),
            height: layout.heightOf(index),
            width: layout.rowWidth,
          };

          if (row.collapsed) {
            return (
              <div className="row row-collapsed" key={row.key} style={rowStyle}>
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
              style={rowStyle}
              data-block={row.blockIndex}
            >
              <div className="side side-left">
                <LineCell
                  lineNumber={row.leftLine}
                  text={row.leftLine !== null ? (leftLines[row.leftLine] ?? '') : null}
                  segments={row.inline?.left}
                  tokens={row.leftLine !== null ? leftHighlight?.[row.leftLine] : undefined}
                  language={leftLanguage}
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
                  tokens={row.rightLine !== null ? rightHighlight?.[row.rightLine] : undefined}
                  language={rightLanguage}
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
