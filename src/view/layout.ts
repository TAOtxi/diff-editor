/**
 * 差异视图的布局计算：行宽、行高、行偏移与纵坐标反查。
 *
 * 为什么单独一层：虚拟滚动需要「给定 scrollTop 反查落在哪一行」。
 * 固定行高时是一次除法，一旦开启自动换行，行高随内容变化，就必须靠
 * 前缀和 + 二分查找。两种模式统一成 RowLayout 接口，DiffView 里不必
 * 到处写 if。
 *
 * 除 measureFont 外都是纯函数，便于单测。
 */

import type { Row } from './rows';

/** 单行高度，px。必须与 CSS 的 line-height 一致。 */
export const ROW_HEIGHT = 22;

/** 制表符占的列数。必须与 CSS 的 tab-size 一致。 */
export const TAB_SIZE = 4;

/** 中缝宽度，px。必须与 .row 的 grid-template-columns 里的 96px 一致。 */
export const MIDDLE_WIDTH = 96;

/** 行号槽宽度，px。必须与 .gutter 的 width 一致。 */
export const GUTTER_WIDTH = 52;

/** 正文右侧留白，px。必须与 .line-content 的 padding-right 一致。 */
export const CELL_PADDING = 8;

/** 一行从行号槽到正文末尾占的固定宽度。 */
export const SIDE_CHROME = GUTTER_WIDTH + CELL_PADDING;

/** 一行布局的查询接口。 */
export interface RowLayout {
  /** 全部内容的纵向总高度。 */
  totalHeight: number;
  /** 每一行应设置的宽度，超出容器即出现横向滚动。 */
  rowWidth: number;
  /** 第 index 行的高度。 */
  heightOf(index: number): number;
  /** 第 index 行的纵向起点。 */
  topOf(index: number): number;
  /** 纵向坐标 y 落在哪一行。越界时夹紧到首行/末行。 */
  indexAt(y: number): number;
}

/** 等宽字体实测出的两个字宽，px。 */
export interface FontMetrics {
  /** 半角字符宽度。 */
  narrow: number;
  /** 全角字符（中文、假名、emoji 等）宽度。 */
  wide: number;
}

/** 拿不到真实字体度量时的兜底值：12.5px 等宽字体的典型值。 */
export const FALLBACK_FONT_METRICS: FontMetrics = { narrow: 7.5, wide: 12.5 };

/**
 * 判定一个码位是否按全角计宽。
 *
 * 粗略但够用：CJK、假名、谚文、全角标点与常见 emoji 都按 2 列算。
 * 宁可算宽一点（多折一行、留白稍多），也不要算窄导致文字互相重叠。
 */
export function isWideChar(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // 谚文字母
    (codePoint >= 0x2e80 && codePoint <= 0x303e) || // CJK 部首与标点
    (codePoint >= 0x3041 && codePoint <= 0x33ff) || // 假名、CJK 兼容区
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK 扩展 A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK 基本区
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) || // 彝文
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // 谚文音节
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK 兼容汉字
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) || // CJK 兼容形式
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // 全角形式
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f64f) || // emoji
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd) // CJK 扩展 B 及以后
  );
}

/**
 * 一行的可视宽度，单位是「半角字符数」。
 *
 * 制表符按 tabSize 对齐到下一个制表位；全角字符按 wideUnits 计。
 * wideUnits 由实测字宽算出（全角宽度 / 半角宽度），比写死 2 更准。
 */
export function visualUnits(text: string, tabSize = TAB_SIZE, wideUnits = 2): number {
  let columns = 0;
  for (const ch of text) {
    if (ch === '\t') {
      columns += tabSize - (columns % tabSize);
      continue;
    }
    const codePoint = ch.codePointAt(0) ?? 0;
    columns += isWideChar(codePoint) ? wideUnits : 1;
  }
  return columns;
}

/**
 * 一组行的最大可视宽度。
 *
 * 先用「字符数 × 每字符上界」快速排除短行，避免对十万行逐字符扫描。
 */
export function maxVisualUnits(lines: readonly string[], tabSize = TAB_SIZE, wideUnits = 2): number {
  let max = 0;
  const upperBound = Math.max(tabSize, wideUnits);
  for (const line of lines) {
    if (line.length * upperBound <= max) continue;
    const units = visualUnits(line, tabSize, wideUnits);
    if (units > max) max = units;
  }
  return max;
}

/**
 * 实测等宽字体的半角 / 全角宽度。
 *
 * jsdom 里 canvas 拿不到 2d 上下文，会退回 FALLBACK_FONT_METRICS，
 * 这不影响测试，因为布局本身是纯计算。
 */
export function measureFont(el: HTMLElement | null): FontMetrics {
  if (!el || typeof getComputedStyle !== 'function') return FALLBACK_FONT_METRICS;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return FALLBACK_FONT_METRICS;

  const style = getComputedStyle(el);
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const narrow = context.measureText('0').width;
  if (!Number.isFinite(narrow) || narrow <= 0) return FALLBACK_FONT_METRICS;

  const wide = context.measureText('中').width;
  return {
    narrow,
    wide: Number.isFinite(wide) && wide > 0 ? wide : narrow * 2,
  };
}

/** 固定行高的布局：全是除法，不建任何数组。 */
export function uniformLayout(
  rowCount: number,
  rowWidth: number,
  rowHeight = ROW_HEIGHT,
): RowLayout {
  const lastIndex = Math.max(0, rowCount - 1);
  return {
    totalHeight: rowCount * rowHeight,
    rowWidth,
    heightOf: () => rowHeight,
    topOf: (index) => index * rowHeight,
    indexAt: (y) => {
      if (rowCount === 0) return 0;
      const index = Math.floor(y / rowHeight);
      return index < 0 ? 0 : index > lastIndex ? lastIndex : index;
    },
  };
}

export interface WrappedLayoutParams {
  rows: readonly Row[];
  leftLines: readonly string[];
  rightLines: readonly string[];
  /** 每侧一行能容纳的半角字符数。至少为 1。 */
  columns: number;
  /** 行宽，换行模式下就是容器宽度。 */
  rowWidth: number;
  rowHeight?: number;
  tabSize?: number;
  wideUnits?: number;
}

/**
 * 自动换行下的布局：先算每行折成几行，再前缀和出偏移量。
 *
 * 行高取左右两侧中较高的一侧，保证两侧始终对齐。
 */
export function wrappedLayout({
  rows,
  leftLines,
  rightLines,
  columns,
  rowWidth,
  rowHeight = ROW_HEIGHT,
  tabSize = TAB_SIZE,
  wideUnits = 2,
}: WrappedLayoutParams): RowLayout {
  const safeColumns = Math.max(1, columns);
  const count = rows.length;
  const heights = new Array<number>(count);
  // tops[i+1] 存第 i 行之后的总高度，tops 长度 count + 1
  const tops = new Array<number>(count + 1);
  tops[0] = 0;

  for (let i = 0; i < count; i += 1) {
    const row = rows[i];
    let units = 0;
    if (!row.collapsed) {
      const left = row.leftLine === null ? '' : (leftLines[row.leftLine] ?? '');
      const right = row.rightLine === null ? '' : (rightLines[row.rightLine] ?? '');
      units = Math.max(
        visualUnits(left, tabSize, wideUnits),
        visualUnits(right, tabSize, wideUnits),
      );
    }
    const lines = units <= 0 ? 1 : Math.ceil(units / safeColumns);
    heights[i] = lines * rowHeight;
    tops[i + 1] = tops[i] + heights[i];
  }

  return {
    totalHeight: tops[count],
    rowWidth,
    heightOf: (index) => heights[index] ?? rowHeight,
    topOf: (index) => tops[index] ?? 0,
    indexAt: (y) => {
      if (count === 0) return 0;
      let lo = 0;
      let hi = count - 1;
      // 找最后一个 tops[i] <= y 的行
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (tops[mid] <= y) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    },
  };
}
