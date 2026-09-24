import { describe, expect, it } from 'vitest';
import { computeDiff } from './diff';
import { DEFAULT_COMPARE_OPTIONS, type CompareOptions, type DiffResult } from './types';

function opts(overrides: Partial<CompareOptions> = {}): CompareOptions {
  return { ...DEFAULT_COMPARE_OPTIONS, ...overrides };
}

/**
 * 校验块序列完整覆盖两侧且无重叠 —— 渲染层顺序绘制的前提。
 */
function expectFullCoverage(result: DiffResult, leftLen: number, rightLen: number): void {
  let leftCursor = 0;
  let rightCursor = 0;
  for (const block of result.blocks) {
    expect(block.left.start).toBe(leftCursor);
    expect(block.right.start).toBe(rightCursor);
    expect(block.left.end).toBeGreaterThanOrEqual(block.left.start);
    expect(block.right.end).toBeGreaterThanOrEqual(block.right.start);
    leftCursor = block.left.end;
    rightCursor = block.right.end;
  }
  expect(leftCursor).toBe(leftLen);
  expect(rightCursor).toBe(rightLen);
}

function run(left: string[], right: string[], options = opts()): DiffResult {
  const result = computeDiff(left, right, options);
  expectFullCoverage(result, left.length, right.length);
  return result;
}

describe('computeDiff 基础分类', () => {
  it('完全相同则无差异', () => {
    const r = run(['a', 'b'], ['a', 'b']);
    expect(r.stats.changedBlocks).toBe(0);
    expect(r.changedIndexes).toEqual([]);
    expect(r.blocks.every((b) => b.kind === 'equal')).toBe(true);
  });

  it('两个空文档', () => {
    const r = run([], []);
    expect(r.blocks).toEqual([]);
    expect(r.stats.changedBlocks).toBe(0);
  });

  it('左空右有内容为 insert', () => {
    const r = run([], ['a', 'b']);
    expect(r.stats.insertBlocks).toBe(1);
    expect(r.stats.changedBlocks).toBe(1);
    expect(r.blocks[0].kind).toBe('insert');
  });

  it('左有内容右空为 delete', () => {
    const r = run(['a', 'b'], []);
    expect(r.stats.deleteBlocks).toBe(1);
    expect(r.blocks[0].kind).toBe('delete');
  });

  it('中间整行改动合并为 conflict', () => {
    const r = run(['a', 'x', 'c'], ['a', 'y', 'c']);
    expect(r.stats.conflictBlocks).toBe(1);
    expect(r.stats.changedBlocks).toBe(1);
    const conflict = r.blocks.find((b) => b.kind === 'conflict');
    expect(conflict).toBeDefined();
    expect(conflict!.left).toEqual({ start: 1, end: 2 });
    expect(conflict!.right).toEqual({ start: 1, end: 2 });
  });

  it('纯新增不产生 conflict', () => {
    const r = run(['a', 'c'], ['a', 'b', 'c']);
    expect(r.stats.insertBlocks).toBe(1);
    expect(r.stats.conflictBlocks).toBe(0);
  });

  it('纯删除不产生 conflict', () => {
    const r = run(['a', 'b', 'c'], ['a', 'c']);
    expect(r.stats.deleteBlocks).toBe(1);
    expect(r.stats.conflictBlocks).toBe(0);
  });

  it('多处差异各自成块', () => {
    const r = run(['1', '2', '3', '4', '5'], ['1', 'x', '3', 'y', '5']);
    expect(r.stats.changedBlocks).toBe(2);
    expect(r.changedIndexes).toHaveLength(2);
  });

  it('行数不等的替换也是 conflict', () => {
    const r = run(['a', 'x', 'y', 'b'], ['a', 'z', 'b']);
    expect(r.stats.conflictBlocks).toBe(1);
  });

  it('changedIndexes 指向的块都不是 equal', () => {
    const r = run(['a', 'x', 'c', 'd'], ['a', 'y', 'c', 'e']);
    for (const idx of r.changedIndexes) {
      expect(r.blocks[idx].kind).not.toBe('equal');
    }
  });
});

describe('computeDiff 对比选项', () => {
  it('默认下仅空白差异算作差异', () => {
    const r = run(['a '], ['a']);
    expect(r.stats.changedBlocks).toBe(1);
  });

  it('忽略行尾空白后不算差异', () => {
    const r = run(['a '], ['a'], opts({ ignoreTrailingWhitespace: true }));
    expect(r.stats.changedBlocks).toBe(0);
  });

  it('忽略全部空白后不算差异', () => {
    const r = run([' a  b '], ['ab'], opts({ ignoreAllWhitespace: true }));
    expect(r.stats.changedBlocks).toBe(0);
  });

  it('忽略大小写后不算差异', () => {
    const r = run(['Hello'], ['hello'], opts({ ignoreCase: true }));
    expect(r.stats.changedBlocks).toBe(0);
  });

  it('忽略空行后仅空行差异不算差异', () => {
    const r = run(['a', '', 'b'], ['a', 'b'], opts({ ignoreBlankLines: true }));
    expect(r.stats.changedBlocks).toBe(0);
  });

  it('不忽略空行时空行差异是差异', () => {
    const r = run(['a', '', 'b'], ['a', 'b']);
    expect(r.stats.changedBlocks).toBe(1);
  });

  it('忽略空行时仍完整覆盖所有行', () => {
    const r = run(['', 'a', '', '', 'b', ''], ['a', 'b'], opts({ ignoreBlankLines: true }));
    expectFullCoverage(r, 6, 2);
  });

  it('制表符展开后与空格等价', () => {
    const r = run(['a\tb'], ['a   b'], opts({ tabWidth: 4 }));
    expect(r.stats.changedBlocks).toBe(0);
  });
});

describe('computeDiff 边界用例', () => {
  it('超长单行', () => {
    const long = 'x'.repeat(20000);
    const r = run([long], [`${long}y`]);
    expect(r.stats.conflictBlocks).toBe(1);
  });

  it('CJK 与 emoji 内容', () => {
    const r = run(['中文行😀', '第二行'], ['中文行😀', '第二行改']);
    expect(r.stats.conflictBlocks).toBe(1);
  });

  it('全为空行的两侧行数不同', () => {
    const r = run(['', '', ''], ['', '']);
    expect(r.stats.changedBlocks).toBe(1);
  });

  it('一侧空文档另一侧单空行', () => {
    const r = run([], ['']);
    expect(r.stats.changedBlocks).toBe(1);
  });

  it('大量重复行', () => {
    const left = new Array<string>(200).fill('same');
    const right = new Array<string>(200).fill('same');
    right[100] = 'changed';
    const r = run(left, right);
    expect(r.stats.conflictBlocks).toBe(1);
  });

  it('统计的变更行数与区间长度一致', () => {
    const r = run(['a', 'b', 'c'], ['a', 'x', 'y', 'z']);
    let leftLines = 0;
    let rightLines = 0;
    for (const idx of r.changedIndexes) {
      const b = r.blocks[idx];
      leftLines += b.left.end - b.left.start;
      rightLines += b.right.end - b.right.start;
    }
    expect(r.stats.leftChangedLines).toBe(leftLines);
    expect(r.stats.rightChangedLines).toBe(rightLines);
  });
});
