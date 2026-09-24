import { describe, expect, it } from 'vitest';
import { diffInline, pairConflictLines, tokenizeInline } from './inline';
import type { InlineSegment } from './types';

/** 拼回原文，验证片段序列没有丢字或重复。 */
function joinSegments(segments: InlineSegment[]): string {
  return segments.map((s) => s.text).join('');
}

describe('tokenizeInline', () => {
  it('英文按词切分', () => {
    expect(tokenizeInline('const a = 1')).toEqual(['const', ' ', 'a', ' ', '=', ' ', '1']);
  });

  it('中文逐字切分', () => {
    expect(tokenizeInline('中文行')).toEqual(['中', '文', '行']);
  });

  it('emoji 不被拆坏', () => {
    expect(tokenizeInline('a😀')).toEqual(['a', '😀']);
  });

  it('连续空白合并为一个词', () => {
    expect(tokenizeInline('a   b')).toEqual(['a', '   ', 'b']);
  });

  it('下划线与数字属于同一个词', () => {
    expect(tokenizeInline('foo_bar123')).toEqual(['foo_bar123']);
  });

  it('符号逐个成词', () => {
    expect(tokenizeInline('a.b()')).toEqual(['a', '.', 'b', '(', ')']);
  });

  it('空串得到空数组', () => {
    expect(tokenizeInline('')).toEqual([]);
  });

  it('切分后拼回原文', () => {
    const samples = ['const a = 1', '中文 mixed 内容😀', '  leading', 'trailing  ', 'a.b(c)'];
    for (const s of samples) {
      expect(tokenizeInline(s).join('')).toBe(s);
    }
  });
});

describe('diffInline', () => {
  it('完全相同的行只有 equal 片段', () => {
    const r = diffInline('same text', 'same text');
    expect(r.left.every((s) => s.kind === 'equal')).toBe(true);
    expect(r.right.every((s) => s.kind === 'equal')).toBe(true);
  });

  it('空行对空行', () => {
    const r = diffInline('', '');
    expect(r.left).toEqual([]);
    expect(r.right).toEqual([]);
  });

  it('定位到变化的单词', () => {
    const r = diffInline('const a = 1', 'const a = 2');
    const removed = r.left.filter((s) => s.kind === 'removed');
    const added = r.right.filter((s) => s.kind === 'added');
    expect(removed).toHaveLength(1);
    expect(removed[0].text).toBe('1');
    expect(added).toHaveLength(1);
    expect(added[0].text).toBe('2');
  });

  it('左侧片段拼回左侧原文', () => {
    const left = 'const value = compute(a, b)';
    const right = 'const result = compute(a, c)';
    const r = diffInline(left, right);
    expect(joinSegments(r.left)).toBe(left);
    expect(joinSegments(r.right)).toBe(right);
  });

  it('左侧不含 added 片段，右侧不含 removed 片段', () => {
    const r = diffInline('aaa bbb', 'aaa ccc');
    expect(r.left.some((s) => s.kind === 'added')).toBe(false);
    expect(r.right.some((s) => s.kind === 'removed')).toBe(false);
  });

  it('一侧为空时另一侧整体标记', () => {
    const r = diffInline('', 'new content');
    expect(r.left).toEqual([]);
    expect(joinSegments(r.right)).toBe('new content');
    expect(r.right.every((s) => s.kind === 'added')).toBe(true);
  });

  it('中文行内差异', () => {
    const left = '这是中文内容';
    const right = '这是中文内容修改';
    const r = diffInline(left, right);
    expect(joinSegments(r.left)).toBe(left);
    expect(joinSegments(r.right)).toBe(right);
    expect(r.right.filter((s) => s.kind === 'added').map((s) => s.text)).toEqual(['修改']);
  });

  it('相邻同类片段被合并', () => {
    const r = diffInline('a b c', 'x y z');
    for (let i = 1; i < r.left.length; i += 1) {
      expect(r.left[i].kind).not.toBe(r.left[i - 1].kind);
    }
  });

  it('超长行也能处理', () => {
    const left = 'x '.repeat(500).trim();
    const right = `${left} tail`;
    const r = diffInline(left, right);
    expect(joinSegments(r.left)).toBe(left);
    expect(joinSegments(r.right)).toBe(right);
  });
});

describe('pairConflictLines', () => {
  it('等长时逐行配对', () => {
    expect(pairConflictLines(['a', 'b'], ['x', 'y'])).toEqual([
      { left: 'a', right: 'x' },
      { left: 'b', right: 'y' },
    ]);
  });

  it('左多于右时右侧补 null', () => {
    expect(pairConflictLines(['a', 'b'], ['x'])).toEqual([
      { left: 'a', right: 'x' },
      { left: 'b', right: null },
    ]);
  });

  it('右多于左时左侧补 null', () => {
    expect(pairConflictLines(['a'], ['x', 'y'])).toEqual([
      { left: 'a', right: 'x' },
      { left: null, right: 'y' },
    ]);
  });

  it('两侧都空得到空列表', () => {
    expect(pairConflictLines([], [])).toEqual([]);
  });
});
