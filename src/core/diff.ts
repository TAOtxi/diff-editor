/**
 * 差异块构建：把行级编辑脚本合并为可操作的差异块。
 *
 * 核心约定：相邻的 delete + insert 合并为一个 conflict 块，
 * 这样「双边都改了同一处」在 UI 上呈现为单个可操作单元，
 * 与用户对 git 冲突的直觉一致。
 */

import { diffSequences, type EditSegment } from './myers';
import { isBlank, normalizeLine } from './text';
import type { CompareOptions, DiffBlock, DiffResult, DiffStats } from './types';

/** 构建用于比较的行键序列，并返回到原始行号的映射。 */
interface KeyedLines {
  keys: string[];
  /** keys[i] 对应的原始行下标。 */
  originalIndex: number[];
  /** 原始行总数。 */
  total: number;
}

function buildKeys(lines: readonly string[], options: CompareOptions): KeyedLines {
  const keys: string[] = [];
  const originalIndex: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (options.ignoreBlankLines && isBlank(lines[i])) continue;
    keys.push(normalizeLine(lines[i], options));
    originalIndex.push(i);
  }
  return { keys, originalIndex, total: lines.length };
}

/**
 * 把过滤后序列的下标区间映射回原始行区间。
 *
 * 规则：区间起点取该键对应的原始行号；被忽略的空行归属于其后的区间，
 * 末尾残留的空行归入最后一个区间，保证所有原始行都被某个块覆盖。
 */
function mapStart(keyed: KeyedLines, keyIndex: number): number {
  if (keyIndex >= keyed.originalIndex.length) return keyed.total;
  return keyed.originalIndex[keyIndex];
}

/**
 * 计算两份文档的差异块。
 *
 * 输出的块序列完整覆盖两侧所有行，无空洞、无重叠，这是渲染层可以
 * 直接顺序绘制的前提。
 */
export function computeDiff(
  leftLines: readonly string[],
  rightLines: readonly string[],
  options: CompareOptions,
): DiffResult {
  const leftKeyed = buildKeys(leftLines, options);
  const rightKeyed = buildKeys(rightLines, options);
  const segments = diffSequences(leftKeyed.keys, rightKeyed.keys);

  const raw = segmentsToBlocks(segments, leftKeyed, rightKeyed);
  const blocks = normalizeCoverage(raw, leftLines, rightLines, options);

  return finalize(blocks);
}

/** 未定序号的中间块结构。 */
type RawBlock = Omit<DiffBlock, 'index'>;

function segmentsToBlocks(
  segments: EditSegment[],
  leftKeyed: KeyedLines,
  rightKeyed: KeyedLines,
): RawBlock[] {
  const blocks: RawBlock[] = [];

  for (const seg of segments) {
    const left = { start: mapStart(leftKeyed, seg.aStart), end: mapStart(leftKeyed, seg.aEnd) };
    const right = { start: mapStart(rightKeyed, seg.bStart), end: mapStart(rightKeyed, seg.bEnd) };

    if (seg.type === 'equal') {
      blocks.push({ kind: 'equal', left, right });
      continue;
    }

    if (seg.type === 'delete') {
      // 与紧邻的前一个 insert 合并为冲突
      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind === 'insert') {
        blocks[blocks.length - 1] = {
          kind: 'conflict',
          left: { start: left.start, end: left.end },
          right: prev.right,
        };
        continue;
      }
      blocks.push({ kind: 'delete', left, right: { start: right.start, end: right.start } });
      continue;
    }

    // insert：与紧邻的前一个 delete 合并为冲突
    const prev = blocks[blocks.length - 1];
    if (prev && prev.kind === 'delete') {
      blocks[blocks.length - 1] = {
        kind: 'conflict',
        left: prev.left,
        right: { start: right.start, end: right.end },
      };
      continue;
    }
    blocks.push({ kind: 'insert', left: { start: left.start, end: left.start }, right });
  }

  return blocks;
}

/**
 * 修补覆盖范围：把因忽略空行而被跳过的行补进相邻块，并补齐首尾。
 * 结果保证 left/right 区间首尾相接且覆盖到文档末尾。
 */
function normalizeCoverage(
  blocks: RawBlock[],
  leftLines: readonly string[],
  rightLines: readonly string[],
  options: CompareOptions,
): RawBlock[] {
  const leftTotal = leftLines.length;
  const rightTotal = rightLines.length;
  if (blocks.length === 0) {
    if (leftTotal === 0 && rightTotal === 0) return [];
    if (rightTotal === 0) {
      return [{ kind: 'delete', left: { start: 0, end: leftTotal }, right: { start: 0, end: 0 } }];
    }
    if (leftTotal === 0) {
      return [{ kind: 'insert', left: { start: 0, end: 0 }, right: { start: 0, end: rightTotal } }];
    }
    return [
      {
        kind: 'conflict',
        left: { start: 0, end: leftTotal },
        right: { start: 0, end: rightTotal },
      },
    ];
  }

  const out = blocks.map((b) => ({
    kind: b.kind,
    left: { ...b.left },
    right: { ...b.right },
  }));

  // 首块从 0 开始
  out[0].left.start = 0;
  out[0].right.start = 0;

  // 相邻块首尾相接：后一块的 start 拉到前一块的 end
  for (let i = 1; i < out.length; i += 1) {
    out[i].left.start = out[i - 1].left.end;
    out[i].right.start = out[i - 1].right.end;
    if (out[i].left.end < out[i].left.start) out[i].left.end = out[i].left.start;
    if (out[i].right.end < out[i].right.start) out[i].right.end = out[i].right.start;
  }

  // 末块覆盖到文档结尾
  const last = out[out.length - 1];
  last.left.end = leftTotal;
  last.right.end = rightTotal;

  // 区间被拉伸后类型可能需要修正
  return out
    .map((b) => ({ ...b, kind: reclassify(b, leftLines, rightLines, options) }))
    .filter((b) => b.left.end > b.left.start || b.right.end > b.right.start);
}

/**
 * 依据区间内容重新判定块类型，保证类型与区间自洽。
 *
 * 开启 ignoreBlankLines 时，equal 块两侧行数可以不等（差额来自被忽略的空行），
 * 此时不能降级为 conflict，否则「只多了个空行」会被误报成差异。
 */
function reclassify(
  block: RawBlock,
  leftLines: readonly string[],
  rightLines: readonly string[],
  options: CompareOptions,
): DiffBlock['kind'] {
  const leftLen = block.left.end - block.left.start;
  const rightLen = block.right.end - block.right.start;

  if (block.kind === 'equal') {
    if (leftLen === rightLen) return 'equal';
    if (options.ignoreBlankLines && onlyBlankSurplus(block, leftLines, rightLines)) return 'equal';
    return 'conflict';
  }
  if (leftLen > 0 && rightLen > 0) return 'conflict';
  if (leftLen > 0) return 'delete';
  if (rightLen > 0) return 'insert';
  return 'equal';
}

/**
 * 判断 equal 块两侧的行数差额是否完全由空行造成。
 * 做法：剔除两侧空行后比较剩余行数是否一致。
 */
function onlyBlankSurplus(
  block: RawBlock,
  leftLines: readonly string[],
  rightLines: readonly string[],
): boolean {
  let leftNonBlank = 0;
  for (let i = block.left.start; i < block.left.end; i += 1) {
    if (!isBlank(leftLines[i])) leftNonBlank += 1;
  }
  let rightNonBlank = 0;
  for (let i = block.right.start; i < block.right.end; i += 1) {
    if (!isBlank(rightLines[i])) rightNonBlank += 1;
  }
  return leftNonBlank === rightNonBlank;
}

function finalize(raw: RawBlock[]): DiffResult {
  const blocks: DiffBlock[] = raw.map((b, index) => ({ ...b, index }));
  const changedIndexes: number[] = [];
  const stats: DiffStats = {
    changedBlocks: 0,
    deleteBlocks: 0,
    insertBlocks: 0,
    conflictBlocks: 0,
    leftChangedLines: 0,
    rightChangedLines: 0,
  };

  for (const block of blocks) {
    if (block.kind === 'equal') continue;
    changedIndexes.push(block.index);
    stats.changedBlocks += 1;
    stats.leftChangedLines += block.left.end - block.left.start;
    stats.rightChangedLines += block.right.end - block.right.start;
    if (block.kind === 'delete') stats.deleteBlocks += 1;
    else if (block.kind === 'insert') stats.insertBlocks += 1;
    else stats.conflictBlocks += 1;
  }

  return { blocks, changedIndexes, stats };
}
