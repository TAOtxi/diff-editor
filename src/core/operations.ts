/**
 * 块级操作：四种操作统一实现「让该块左右两侧内容一致」。
 *
 * 所有函数都是纯函数，返回新的行数组，不修改入参。
 * 这让撤销栈只需保存快照引用，也让单测无需构造 UI 状态。
 */

import type { BlockOperation, DiffBlock, KeepBothConfig } from './types';

/** 一次操作的结果文档。 */
export interface DocumentPair {
  left: string[];
  right: string[];
}

/** 取出块在左侧覆盖的行。 */
export function blockLeftLines(block: DiffBlock, left: readonly string[]): string[] {
  return left.slice(block.left.start, block.left.end);
}

/** 取出块在右侧覆盖的行。 */
export function blockRightLines(block: DiffBlock, right: readonly string[]): string[] {
  return right.slice(block.right.start, block.right.end);
}

/**
 * 计算「保留两者」时该块应变成的内容。
 */
export function buildKeepBothLines(
  leftLines: readonly string[],
  rightLines: readonly string[],
  config: KeepBothConfig,
): string[] {
  const first = config.order === 'leftFirst' ? leftLines : rightLines;
  const second = config.order === 'leftFirst' ? rightLines : leftLines;

  if (!config.insertMarkers) {
    return [...first, ...second];
  }

  const firstMarker = config.order === 'leftFirst' ? config.markerLeft : config.markerRight;
  const secondMarker = config.order === 'leftFirst' ? config.markerRight : config.markerLeft;

  return [
    firstMarker,
    ...first,
    config.markerMiddle,
    ...second,
    secondMarker,
  ];
}

/**
 * 计算某个块在指定操作下的目标内容。
 * 返回的行数组会同时写入左右两侧。
 */
export function resolveBlockContent(
  block: DiffBlock,
  left: readonly string[],
  right: readonly string[],
  operation: BlockOperation,
  keepBoth: KeepBothConfig,
): string[] {
  const leftLines = blockLeftLines(block, left);
  const rightLines = blockRightLines(block, right);

  switch (operation) {
    case 'takeLeft':
      return leftLines;
    case 'takeRight':
      return rightLines;
    case 'keepBoth':
      return buildKeepBothLines(leftLines, rightLines, keepBoth);
    case 'deleteBoth':
      return [];
  }
}

/**
 * 对单个差异块执行操作，返回新的文档对。
 *
 * 不变式：返回结果中该块区间的左右内容完全一致。
 */
export function applyBlockOperation(
  block: DiffBlock,
  left: readonly string[],
  right: readonly string[],
  operation: BlockOperation,
  keepBoth: KeepBothConfig,
): DocumentPair {
  const content = resolveBlockContent(block, left, right, operation, keepBoth);

  return {
    left: [...left.slice(0, block.left.start), ...content, ...left.slice(block.left.end)],
    right: [...right.slice(0, block.right.start), ...content, ...right.slice(block.right.end)],
  };
}

/**
 * 批量对多个块执行同一操作。
 *
 * 必须从后往前应用，否则前面的块改变行数后，后面块的区间下标失效。
 */
export function applyBlockOperations(
  blocks: readonly DiffBlock[],
  left: readonly string[],
  right: readonly string[],
  operation: BlockOperation,
  keepBoth: KeepBothConfig,
): DocumentPair {
  const targets = blocks
    .filter((b) => b.kind !== 'equal')
    .slice()
    .sort((a, b) => b.left.start - a.left.start);

  let current: DocumentPair = { left: [...left], right: [...right] };
  for (const block of targets) {
    current = applyBlockOperation(block, current.left, current.right, operation, keepBoth);
  }
  return current;
}

/**
 * 针对块类型给出符合直觉的操作标签。
 *
 * 底层只有四种语义，但 delete/insert 块上「采用某侧」实际表现为
 * 复制或删除，标签必须贴合用户看到的效果。
 */
export function operationLabel(kind: DiffBlock['kind'], operation: BlockOperation): string {
  if (kind === 'delete') {
    // 左侧有内容、右侧为空：采用左侧 = 把内容复制到右侧
    if (operation === 'takeLeft') return '复制到右侧';
    if (operation === 'takeRight') return '删除该差异';
  }
  if (kind === 'insert') {
    // 右侧有内容、左侧为空：采用右侧 = 把内容复制到左侧
    if (operation === 'takeLeft') return '删除该差异';
    if (operation === 'takeRight') return '复制到左侧';
  }
  switch (operation) {
    case 'takeLeft':
      return '采用左侧';
    case 'takeRight':
      return '采用右侧';
    case 'keepBoth':
      return '两者都保留';
    case 'deleteBoth':
      return '两侧都删除';
  }
}

/** 某类型的块上，哪些操作有意义。 */
export function availableOperations(kind: DiffBlock['kind']): BlockOperation[] {
  if (kind === 'equal') return [];
  if (kind === 'conflict') return ['takeLeft', 'takeRight', 'keepBoth', 'deleteBoth'];
  // delete/insert 块：采用左/右已覆盖「复制」与「删除」两种效果，
  // keepBoth 在单边块上等价于 takeLeft/takeRight，因此不提供
  return ['takeLeft', 'takeRight'];
}
