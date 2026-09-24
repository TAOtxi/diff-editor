import { describe, expect, it } from 'vitest';
import { diffSequences, type EditSegment } from './myers';

/** 用 DP 求最长公共子序列长度，作为交叉验证的参照实现。 */
function lcsLength(a: readonly string[], b: readonly string[]): number {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[n][m];
}

/** 校验编辑脚本自身的结构合法性，并回放出两侧序列。 */
function replay(
  segments: EditSegment[],
  a: readonly string[],
  b: readonly string[],
): { a: string[]; b: string[]; equalCount: number } {
  let aCursor = 0;
  let bCursor = 0;
  const outA: string[] = [];
  const outB: string[] = [];
  let equalCount = 0;

  for (const seg of segments) {
    expect(seg.aStart).toBe(aCursor);
    expect(seg.bStart).toBe(bCursor);
    expect(seg.aEnd).toBeGreaterThanOrEqual(seg.aStart);
    expect(seg.bEnd).toBeGreaterThanOrEqual(seg.bStart);

    if (seg.type === 'equal') {
      const len = seg.aEnd - seg.aStart;
      expect(seg.bEnd - seg.bStart).toBe(len);
      for (let i = 0; i < len; i += 1) {
        expect(a[seg.aStart + i]).toBe(b[seg.bStart + i]);
      }
      equalCount += len;
    } else if (seg.type === 'delete') {
      expect(seg.bEnd).toBe(seg.bStart);
      expect(seg.aEnd).toBeGreaterThan(seg.aStart);
    } else {
      expect(seg.aEnd).toBe(seg.aStart);
      expect(seg.bEnd).toBeGreaterThan(seg.bStart);
    }

    for (let i = seg.aStart; i < seg.aEnd; i += 1) outA.push(a[i]);
    for (let i = seg.bStart; i < seg.bEnd; i += 1) outB.push(b[i]);
    aCursor = seg.aEnd;
    bCursor = seg.bEnd;
  }

  expect(aCursor).toBe(a.length);
  expect(bCursor).toBe(b.length);
  return { a: outA, b: outB, equalCount };
}

function check(a: string[], b: string[]): EditSegment[] {
  const segs = diffSequences(a, b);
  const played = replay(segs, a, b);
  expect(played.a).toEqual(a);
  expect(played.b).toEqual(b);
  // 关键正确性判据：equal 段总长必须等于 LCS 长度，即编辑脚本是最优解
  expect(played.equalCount).toBe(lcsLength(a, b));
  return segs;
}

describe('diffSequences 基础用例', () => {
  it('两个空序列', () => {
    expect(diffSequences([], [])).toEqual([]);
  });

  it('完全相同', () => {
    const a = ['a', 'b', 'c'];
    const segs = check(a, [...a]);
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe('equal');
  });

  it('左侧为空则全是新增', () => {
    const segs = check([], ['a', 'b']);
    expect(segs).toEqual([{ type: 'insert', aStart: 0, aEnd: 0, bStart: 0, bEnd: 2 }]);
  });

  it('右侧为空则全是删除', () => {
    const segs = check(['a', 'b'], []);
    expect(segs).toEqual([{ type: 'delete', aStart: 0, aEnd: 2, bStart: 0, bEnd: 0 }]);
  });

  it('中间整行替换', () => {
    check(['a', 'x', 'c'], ['a', 'y', 'c']);
  });

  it('仅开头新增', () => {
    check(['b', 'c'], ['a', 'b', 'c']);
  });

  it('仅末尾删除', () => {
    check(['a', 'b', 'c'], ['a', 'b']);
  });

  it('完全不相交', () => {
    check(['a', 'b'], ['c', 'd']);
  });

  it('重复行序列', () => {
    check(['a', 'a', 'a', 'a'], ['a', 'a']);
  });

  it('交错修改', () => {
    check(['1', '2', '3', '4', '5', '6'], ['1', 'x', '3', 'y', '5', 'z']);
  });

  it('大段搬移', () => {
    check(['a', 'b', 'c', 'd', 'e'], ['d', 'e', 'a', 'b', 'c']);
  });
});

describe('diffSequences 随机化交叉验证', () => {
  /** 固定种子的线性同余发生器，保证失败可复现。 */
  function makeRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  it('小字母表随机序列与 DP 结果一致', () => {
    const rng = makeRng(20240501);
    const alphabet = ['a', 'b', 'c'];
    for (let iter = 0; iter < 400; iter += 1) {
      const n = Math.floor(rng() * 12);
      const m = Math.floor(rng() * 12);
      const a = Array.from({ length: n }, () => alphabet[Math.floor(rng() * alphabet.length)]);
      const b = Array.from({ length: m }, () => alphabet[Math.floor(rng() * alphabet.length)]);
      try {
        check(a, b);
      } catch (err) {
        throw new Error(`用例失败 iter=${iter} a=${JSON.stringify(a)} b=${JSON.stringify(b)}\n${String(err)}`);
      }
    }
  });

  it('较大字母表与较长序列', () => {
    const rng = makeRng(987654321);
    for (let iter = 0; iter < 120; iter += 1) {
      const n = Math.floor(rng() * 40);
      const m = Math.floor(rng() * 40);
      const a = Array.from({ length: n }, () => String(Math.floor(rng() * 15)));
      const b = Array.from({ length: m }, () => String(Math.floor(rng() * 15)));
      try {
        check(a, b);
      } catch (err) {
        throw new Error(`用例失败 iter=${iter} a=${JSON.stringify(a)} b=${JSON.stringify(b)}\n${String(err)}`);
      }
    }
  });

  it('高度相似的长序列（仅少量改动）', () => {
    const rng = makeRng(13579);
    for (let iter = 0; iter < 60; iter += 1) {
      const base = Array.from({ length: 80 }, (_, i) => `line-${i}`);
      const modified = [...base];
      const edits = 1 + Math.floor(rng() * 5);
      for (let e = 0; e < edits; e += 1) {
        const pos = Math.floor(rng() * modified.length);
        const kind = Math.floor(rng() * 3);
        if (kind === 0) modified.splice(pos, 1);
        else if (kind === 1) modified.splice(pos, 0, `new-${e}`);
        else modified[pos] = `changed-${e}`;
      }
      try {
        check(base, modified);
      } catch (err) {
        throw new Error(`用例失败 iter=${iter}\n${String(err)}`);
      }
    }
  });
});
