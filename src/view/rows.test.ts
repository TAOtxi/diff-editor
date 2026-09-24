import { describe, expect, it } from 'vitest';
import { computeDiff } from '../core/diff';
import { DEFAULT_COMPARE_OPTIONS } from '../core/types';
import { blockRowSpan, buildRows, findRowForBlock } from './rows';

function rowsFor(left: string[], right: string[], contextLines: number | null = null) {
  const result = computeDiff(left, right, DEFAULT_COMPARE_OPTIONS);
  return {
    rows: buildRows({ blocks: result.blocks, leftLines: left, rightLines: right, contextLines }),
    result,
  };
}

describe('buildRows 行数与对齐', () => {
  it('完全相同时行数等于文档行数', () => {
    const { rows } = rowsFor(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.kind === 'equal')).toBe(true);
  });

  it('两侧都空时没有行', () => {
    const { rows } = rowsFor([], []);
    expect(rows).toHaveLength(0);
  });

  it('delete 块在右侧留空占位', () => {
    const { rows } = rowsFor(['a', 'b', 'c'], ['a', 'c']);
    const deleteRows = rows.filter((r) => r.kind === 'delete');
    expect(deleteRows).toHaveLength(1);
    expect(deleteRows[0].leftLine).toBe(1);
    expect(deleteRows[0].rightLine).toBeNull();
  });

  it('insert 块在左侧留空占位', () => {
    const { rows } = rowsFor(['a', 'c'], ['a', 'b', 'c']);
    const insertRows = rows.filter((r) => r.kind === 'insert');
    expect(insertRows).toHaveLength(1);
    expect(insertRows[0].leftLine).toBeNull();
    expect(insertRows[0].rightLine).toBe(1);
  });

  it('conflict 块逐行配对并带行内差异', () => {
    const { rows } = rowsFor(['a', 'x', 'c'], ['a', 'y', 'c']);
    const conflictRows = rows.filter((r) => r.kind === 'conflict');
    expect(conflictRows).toHaveLength(1);
    expect(conflictRows[0].inline).toBeDefined();
    expect(conflictRows[0].leftLine).toBe(1);
    expect(conflictRows[0].rightLine).toBe(1);
  });

  it('行数不等的 conflict 块按最长侧配对', () => {
    const { rows } = rowsFor(['a', 'x', 'b'], ['a', 'p', 'q', 'r', 'b']);
    const conflictRows = rows.filter((r) => r.kind === 'conflict');
    expect(conflictRows).toHaveLength(3);
    expect(conflictRows[0].inline).toBeDefined();
    // 左侧只有一行，后两行左侧为空占位且无行内差异
    expect(conflictRows[1].leftLine).toBeNull();
    expect(conflictRows[1].inline).toBeUndefined();
  });

  it('每行的 key 连续且唯一', () => {
    const { rows } = rowsFor(['1', '2', 'x', '4'], ['1', '2', 'y', '4', '5']);
    rows.forEach((row, i) => expect(row.key).toBe(i));
  });

  it('所有原始行都出现在行列表中', () => {
    const left = ['1', '2', '3', '4'];
    const right = ['1', 'x', '3', '5'];
    const { rows } = rowsFor(left, right);
    const leftSeen = rows.filter((r) => r.leftLine !== null).map((r) => r.leftLine);
    const rightSeen = rows.filter((r) => r.rightLine !== null).map((r) => r.rightLine);
    expect(leftSeen).toEqual([0, 1, 2, 3]);
    expect(rightSeen).toEqual([0, 1, 2, 3]);
  });
});

describe('buildRows 折叠', () => {
  const left = Array.from({ length: 30 }, (_, i) => `line${i}`);
  const right = [...left];
  right[15] = 'changed';

  it('不折叠时显示全部行', () => {
    const { rows } = rowsFor(left, right, null);
    expect(rows).toHaveLength(30);
    expect(rows.some((r) => r.collapsed)).toBe(false);
  });

  it('折叠时出现占位行且总行数减少', () => {
    const { rows } = rowsFor(left, right, 3);
    expect(rows.length).toBeLessThan(30);
    expect(rows.some((r) => r.collapsed)).toBe(true);
  });

  it('折叠占位行记录隐藏行数与起始行号', () => {
    const { rows } = rowsFor(left, right, 3);
    const placeholder = rows.find((r) => r.collapsed);
    expect(placeholder?.collapsed?.count).toBeGreaterThan(0);
    expect(placeholder?.collapsed?.leftStart).toBeGreaterThanOrEqual(0);
  });

  it('差异行本身永不被折叠', () => {
    const { rows } = rowsFor(left, right, 3);
    const changed = rows.filter((r) => r.kind !== 'equal');
    expect(changed).toHaveLength(1);
    expect(changed[0].collapsed).toBeUndefined();
  });

  it('相同行较少时不折叠', () => {
    const { rows } = rowsFor(['a', 'x', 'b'], ['a', 'y', 'b'], 3);
    expect(rows.some((r) => r.collapsed)).toBe(false);
  });

  it('首块折叠时不保留上文', () => {
    const big = Array.from({ length: 40 }, (_, i) => `l${i}`);
    const modified = [...big];
    modified[38] = 'changed';
    const { rows } = rowsFor(big, modified, 3);
    // 首个 equal 块只需保留尾部上下文
    expect(rows[0].collapsed).toBeDefined();
  });
});

describe('findRowForBlock 与 blockRowSpan', () => {
  it('定位到块的首行', () => {
    const { rows, result } = rowsFor(['a', 'x', 'c'], ['a', 'y', 'c']);
    const idx = result.changedIndexes[0];
    const rowIndex = findRowForBlock(rows, idx);
    expect(rowIndex).toBeGreaterThanOrEqual(0);
    expect(rows[rowIndex].blockIndex).toBe(idx);
  });

  it('不存在的块返回 -1', () => {
    const { rows } = rowsFor(['a'], ['a']);
    expect(findRowForBlock(rows, 999)).toBe(-1);
  });

  it('跨度覆盖该块所有行', () => {
    const { rows, result } = rowsFor(['a', 'x', 'y', 'b'], ['a', 'b']);
    const idx = result.changedIndexes[0];
    const span = blockRowSpan(rows, idx);
    expect(span.count).toBe(2);
    for (let i = span.start; i < span.start + span.count; i += 1) {
      expect(rows[i].blockIndex).toBe(idx);
    }
  });
});
