import { describe, expect, it } from 'vitest';
import { computeDiff } from './diff';
import {
  applyBlockOperation,
  applyBlockOperations,
  availableOperations,
  buildKeepBothLines,
  operationLabel,
} from './operations';
import {
  DEFAULT_COMPARE_OPTIONS,
  DEFAULT_KEEP_BOTH_CONFIG,
  type BlockOperation,
  type DiffBlock,
} from './types';

const KB = DEFAULT_KEEP_BOTH_CONFIG;

function firstChanged(left: string[], right: string[]): DiffBlock {
  const result = computeDiff(left, right, DEFAULT_COMPARE_OPTIONS);
  const idx = result.changedIndexes[0];
  expect(idx).toBeDefined();
  return result.blocks[idx];
}

function changedCount(left: string[], right: string[]): number {
  return computeDiff(left, right, DEFAULT_COMPARE_OPTIONS).stats.changedBlocks;
}

describe('applyBlockOperation 核心不变式', () => {
  const scenarios: Array<{ name: string; left: string[]; right: string[] }> = [
    { name: 'conflict 块', left: ['a', 'x', 'c'], right: ['a', 'y', 'c'] },
    { name: 'delete 块', left: ['a', 'b', 'c'], right: ['a', 'c'] },
    { name: 'insert 块', left: ['a', 'c'], right: ['a', 'b', 'c'] },
    { name: '多行 conflict', left: ['a', 'x', 'y', 'd'], right: ['a', 'p', 'q', 'r', 'd'] },
    { name: '首行差异', left: ['x', 'b'], right: ['y', 'b'] },
    { name: '末行差异', left: ['a', 'x'], right: ['a', 'y'] },
    { name: '整篇不同', left: ['a'], right: ['b'] },
  ];

  const operations: BlockOperation[] = ['takeLeft', 'takeRight', 'keepBoth', 'deleteBoth'];

  for (const scenario of scenarios) {
    for (const op of operations) {
      it(`${scenario.name} 执行 ${op} 后该处差异被消解`, () => {
        const block = firstChanged(scenario.left, scenario.right);
        const before = changedCount(scenario.left, scenario.right);
        const next = applyBlockOperation(block, scenario.left, scenario.right, op, KB);
        const after = changedCount(next.left, next.right);

        // 不变式：差异数恰好减一
        expect(after).toBe(before - 1);

        // 不变式：入参未被修改
        expect(scenario.left).toEqual(scenarios.find((s) => s === scenario)!.left);
      });
    }
  }

  it('对唯一差异执行操作后两份文档完全一致', () => {
    const left = ['a', 'x', 'c'];
    const right = ['a', 'y', 'c'];
    for (const op of operations) {
      const block = firstChanged(left, right);
      const next = applyBlockOperation(block, left, right, op, KB);
      expect(next.left).toEqual(next.right);
    }
  });

  it('依次处理所有差异后两份文档一致', () => {
    let left = ['1', '2', '3', '4', '5', '6'];
    let right = ['1', 'x', '3', 'y', '5', 'z', '7'];
    let guard = 0;
    while (changedCount(left, right) > 0) {
      guard += 1;
      expect(guard).toBeLessThan(50);
      const block = firstChanged(left, right);
      const next = applyBlockOperation(block, left, right, 'takeLeft', KB);
      left = next.left;
      right = next.right;
    }
    expect(left).toEqual(right);
  });
});

describe('applyBlockOperation 具体结果', () => {
  it('conflict 采用左侧', () => {
    const left = ['a', 'x', 'c'];
    const right = ['a', 'y', 'c'];
    const next = applyBlockOperation(firstChanged(left, right), left, right, 'takeLeft', KB);
    expect(next.left).toEqual(['a', 'x', 'c']);
    expect(next.right).toEqual(['a', 'x', 'c']);
  });

  it('conflict 采用右侧', () => {
    const left = ['a', 'x', 'c'];
    const right = ['a', 'y', 'c'];
    const next = applyBlockOperation(firstChanged(left, right), left, right, 'takeRight', KB);
    expect(next.left).toEqual(['a', 'y', 'c']);
    expect(next.right).toEqual(['a', 'y', 'c']);
  });

  it('conflict 两者都保留为左先右后', () => {
    const left = ['a', 'x', 'c'];
    const right = ['a', 'y', 'c'];
    const next = applyBlockOperation(firstChanged(left, right), left, right, 'keepBoth', KB);
    expect(next.left).toEqual(['a', 'x', 'y', 'c']);
    expect(next.right).toEqual(['a', 'x', 'y', 'c']);
  });

  it('conflict 两侧都删除', () => {
    const left = ['a', 'x', 'c'];
    const right = ['a', 'y', 'c'];
    const next = applyBlockOperation(firstChanged(left, right), left, right, 'deleteBoth', KB);
    expect(next.left).toEqual(['a', 'c']);
    expect(next.right).toEqual(['a', 'c']);
  });

  it('delete 块采用左侧等于复制到右侧', () => {
    const left = ['a', 'b', 'c'];
    const right = ['a', 'c'];
    const next = applyBlockOperation(firstChanged(left, right), left, right, 'takeLeft', KB);
    expect(next.right).toEqual(['a', 'b', 'c']);
    expect(next.left).toEqual(['a', 'b', 'c']);
  });

  it('delete 块采用右侧等于删除该差异', () => {
    const left = ['a', 'b', 'c'];
    const right = ['a', 'c'];
    const next = applyBlockOperation(firstChanged(left, right), left, right, 'takeRight', KB);
    expect(next.left).toEqual(['a', 'c']);
    expect(next.right).toEqual(['a', 'c']);
  });

  it('insert 块采用右侧等于复制到左侧', () => {
    const left = ['a', 'c'];
    const right = ['a', 'b', 'c'];
    const next = applyBlockOperation(firstChanged(left, right), left, right, 'takeRight', KB);
    expect(next.left).toEqual(['a', 'b', 'c']);
  });

  it('insert 块采用左侧等于删除该差异', () => {
    const left = ['a', 'c'];
    const right = ['a', 'b', 'c'];
    const next = applyBlockOperation(firstChanged(left, right), left, right, 'takeLeft', KB);
    expect(next.right).toEqual(['a', 'c']);
  });
});

describe('buildKeepBothLines', () => {
  it('左先右后', () => {
    expect(buildKeepBothLines(['L'], ['R'], KB)).toEqual(['L', 'R']);
  });

  it('右先左后', () => {
    expect(buildKeepBothLines(['L'], ['R'], { ...KB, order: 'rightFirst' })).toEqual(['R', 'L']);
  });

  it('插入冲突标记', () => {
    const config = { ...KB, insertMarkers: true };
    expect(buildKeepBothLines(['L'], ['R'], config)).toEqual([
      config.markerLeft,
      'L',
      config.markerMiddle,
      'R',
      config.markerRight,
    ]);
  });

  it('右先时标记顺序对应互换', () => {
    const config = { ...KB, insertMarkers: true, order: 'rightFirst' as const };
    expect(buildKeepBothLines(['L'], ['R'], config)).toEqual([
      config.markerRight,
      'R',
      config.markerMiddle,
      'L',
      config.markerLeft,
    ]);
  });

  it('一侧为空时仍拼接另一侧', () => {
    expect(buildKeepBothLines([], ['R'], KB)).toEqual(['R']);
    expect(buildKeepBothLines(['L'], [], KB)).toEqual(['L']);
  });
});

describe('applyBlockOperations 批量', () => {
  it('全部采用左侧后两份文档等于左侧原文', () => {
    const left = ['1', '2', '3', '4', '5'];
    const right = ['1', 'x', '3', 'y', '6'];
    const result = computeDiff(left, right, DEFAULT_COMPARE_OPTIONS);
    const next = applyBlockOperations(result.blocks, left, right, 'takeLeft', KB);
    expect(next.left).toEqual(left);
    expect(next.right).toEqual(left);
    expect(changedCount(next.left, next.right)).toBe(0);
  });

  it('全部采用右侧后两份文档等于右侧原文', () => {
    const left = ['1', '2', '3'];
    const right = ['a', 'b'];
    const result = computeDiff(left, right, DEFAULT_COMPARE_OPTIONS);
    const next = applyBlockOperations(result.blocks, left, right, 'takeRight', KB);
    expect(next.left).toEqual(right);
    expect(next.right).toEqual(right);
  });

  it('全部保留两者后不再有差异', () => {
    const left = ['a', 'x', 'c'];
    const right = ['a', 'y', 'c'];
    const result = computeDiff(left, right, DEFAULT_COMPARE_OPTIONS);
    const next = applyBlockOperations(result.blocks, left, right, 'keepBoth', KB);
    expect(next.left).toEqual(next.right);
    expect(changedCount(next.left, next.right)).toBe(0);
  });

  it('无差异时批量操作是空操作', () => {
    const left = ['a', 'b'];
    const right = ['a', 'b'];
    const result = computeDiff(left, right, DEFAULT_COMPARE_OPTIONS);
    const next = applyBlockOperations(result.blocks, left, right, 'takeLeft', KB);
    expect(next.left).toEqual(left);
    expect(next.right).toEqual(right);
  });
});

describe('操作标签与可用集合', () => {
  it('delete 块标签贴合实际效果', () => {
    expect(operationLabel('delete', 'takeLeft')).toBe('复制到右侧');
    expect(operationLabel('delete', 'takeRight')).toBe('删除该差异');
  });

  it('insert 块标签贴合实际效果', () => {
    expect(operationLabel('insert', 'takeRight')).toBe('复制到左侧');
    expect(operationLabel('insert', 'takeLeft')).toBe('删除该差异');
  });

  it('conflict 块使用采用语义标签', () => {
    expect(operationLabel('conflict', 'takeLeft')).toBe('采用左侧');
    expect(operationLabel('conflict', 'keepBoth')).toBe('两者都保留');
    expect(operationLabel('conflict', 'deleteBoth')).toBe('两侧都删除');
  });

  it('equal 块没有可用操作', () => {
    expect(availableOperations('equal')).toEqual([]);
  });

  it('conflict 块四种操作齐全', () => {
    expect(availableOperations('conflict')).toHaveLength(4);
  });

  it('单边块只有两种操作', () => {
    expect(availableOperations('delete')).toEqual(['takeLeft', 'takeRight']);
    expect(availableOperations('insert')).toEqual(['takeLeft', 'takeRight']);
  });
});
