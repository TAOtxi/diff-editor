/**
 * 渲染行模型：把差异块摊平成一维行列表，供虚拟滚动直接按下标取用。
 *
 * 两侧共用同一个行列表，保证左右天然对齐 —— 这比分别渲染再同步滚动
 * 更可靠，不会因为行高差异而错位。
 */

import type { DiffBlock, InlineLineDiff } from '../core/types';
import { diffInline } from '../core/inline';

/** 一个可渲染行。 */
export interface Row {
  /** 在整个行列表中的下标。 */
  key: number;
  /** 所属差异块序号。 */
  blockIndex: number;
  kind: DiffBlock['kind'];
  /** 左侧原始行号（0 基），null 表示该侧此行为空占位。 */
  leftLine: number | null;
  rightLine: number | null;
  /** 折叠占位行：代表被隐藏的若干相同行。 */
  collapsed?: { count: number; leftStart: number; rightStart: number };
  /** 冲突行的行内差异，仅冲突块内左右都有内容的行才有。 */
  inline?: InlineLineDiff;
}

export interface BuildRowsParams {
  blocks: readonly DiffBlock[];
  leftLines: readonly string[];
  rightLines: readonly string[];
  /** 相同区域保留的上下文行数；null 表示不折叠。 */
  contextLines: number | null;
  /** 折叠阈值：相同行数超过 contextLines * 2 + threshold 才折叠。 */
  collapseThreshold?: number;
  /** 已被用户手动展开的 equal 块，这些块不再折叠。 */
  expandedBlocks?: ReadonlySet<number>;
}

const DEFAULT_COLLAPSE_THRESHOLD = 4;

/**
 * 构建渲染行列表。
 *
 * equal 块按需折叠中间部分；delete/insert 块在缺失侧留空占位；
 * conflict 块内左右行按序配对，多出的行与空占位配对。
 */
export function buildRows(params: BuildRowsParams): Row[] {
  const { blocks, leftLines, rightLines, contextLines } = params;
  const threshold = params.collapseThreshold ?? DEFAULT_COLLAPSE_THRESHOLD;
  const rows: Row[] = [];

  const push = (row: Omit<Row, 'key'>): void => {
    rows.push({ ...row, key: rows.length });
  };

  for (const block of blocks) {
    const leftLen = block.left.end - block.left.start;
    const rightLen = block.right.end - block.right.start;

    if (block.kind === 'equal') {
      const len = Math.max(leftLen, rightLen);
      const canCollapse =
        contextLines !== null &&
        len > contextLines * 2 + threshold &&
        !params.expandedBlocks?.has(block.index);

      if (!canCollapse) {
        for (let i = 0; i < len; i += 1) {
          push({
            blockIndex: block.index,
            kind: 'equal',
            leftLine: i < leftLen ? block.left.start + i : null,
            rightLine: i < rightLen ? block.right.start + i : null,
          });
        }
        continue;
      }

      const ctx = contextLines;
      // 首块顶部无需保留上文，末块底部无需保留下文
      const isFirst = block.index === 0;
      const isLast = block.index === blocks.length - 1;
      const head = isFirst ? 0 : ctx;
      const tail = isLast ? 0 : ctx;

      for (let i = 0; i < head; i += 1) {
        push({
          blockIndex: block.index,
          kind: 'equal',
          leftLine: i < leftLen ? block.left.start + i : null,
          rightLine: i < rightLen ? block.right.start + i : null,
        });
      }

      const hiddenCount = len - head - tail;
      if (hiddenCount > 0) {
        push({
          blockIndex: block.index,
          kind: 'equal',
          leftLine: null,
          rightLine: null,
          collapsed: {
            count: hiddenCount,
            leftStart: block.left.start + head,
            rightStart: block.right.start + head,
          },
        });
      }

      for (let i = len - tail; i < len; i += 1) {
        push({
          blockIndex: block.index,
          kind: 'equal',
          leftLine: i < leftLen ? block.left.start + i : null,
          rightLine: i < rightLen ? block.right.start + i : null,
        });
      }
      continue;
    }

    if (block.kind === 'delete') {
      for (let i = 0; i < leftLen; i += 1) {
        push({
          blockIndex: block.index,
          kind: 'delete',
          leftLine: block.left.start + i,
          rightLine: null,
        });
      }
      continue;
    }

    if (block.kind === 'insert') {
      for (let i = 0; i < rightLen; i += 1) {
        push({
          blockIndex: block.index,
          kind: 'insert',
          leftLine: null,
          rightLine: block.right.start + i,
        });
      }
      continue;
    }

    // conflict：逐行配对，两侧都有内容时计算行内差异
    const len = Math.max(leftLen, rightLen);
    for (let i = 0; i < len; i += 1) {
      const leftLine = i < leftLen ? block.left.start + i : null;
      const rightLine = i < rightLen ? block.right.start + i : null;
      const inline =
        leftLine !== null && rightLine !== null
          ? diffInline(leftLines[leftLine], rightLines[rightLine])
          : undefined;
      push({ blockIndex: block.index, kind: 'conflict', leftLine, rightLine, inline });
    }
  }

  return rows;
}

/** 找到某差异块对应的第一行下标，供导航滚动定位。 */
export function findRowForBlock(rows: readonly Row[], blockIndex: number): number {
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].blockIndex === blockIndex) return i;
  }
  return -1;
}

/** 某块在行列表中占据的行数，用于绘制块级操作按钮的跨度。 */
export function blockRowSpan(rows: readonly Row[], blockIndex: number): { start: number; count: number } {
  let start = -1;
  let count = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].blockIndex === blockIndex) {
      if (start === -1) start = i;
      count += 1;
    } else if (start !== -1) {
      break;
    }
  }
  return { start, count };
}
