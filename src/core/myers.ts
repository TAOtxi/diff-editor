/**
 * 序列差异算法：Myers 的线性空间变体（双向搜索 + 中点分割递归）。
 *
 * 实现要点：
 * - 只在下标区间上工作，不切片数组，避免大文件下的大量临时分配。
 * - 先裁剪公共前后缀，这对「只改了中间几行」的真实场景效果显著。
 * - 输出按 a、b 的自然顺序排列，便于后续直接合并为差异块。
 *
 * 正确性依赖随机化测试与 DP 版 LCS 交叉验证（见 myers.test.ts）。
 */

/** 编辑脚本中的一段。区间均为左闭右开。 */
export interface EditSegment {
  type: 'equal' | 'delete' | 'insert';
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

/**
 * 计算两个序列的编辑脚本。
 *
 * @param a 左侧序列（通常是归一化后的行键）
 * @param b 右侧序列
 */
export function diffSequences(a: readonly string[], b: readonly string[]): EditSegment[] {
  const out: EditSegment[] = [];
  compute(a, b, 0, a.length, 0, b.length, out);
  return mergeAdjacent(out);
}

function compute(
  a: readonly string[],
  b: readonly string[],
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  out: EditSegment[],
): void {
  let a0 = aStart;
  let a1 = aEnd;
  let b0 = bStart;
  let b1 = bEnd;

  // 公共前缀
  let pre = 0;
  while (a0 + pre < a1 && b0 + pre < b1 && a[a0 + pre] === b[b0 + pre]) pre += 1;
  if (pre > 0) {
    out.push({ type: 'equal', aStart: a0, aEnd: a0 + pre, bStart: b0, bEnd: b0 + pre });
    a0 += pre;
    b0 += pre;
  }

  // 公共后缀：先记下，递归结束后再追加，保证输出顺序
  let suf = 0;
  while (a1 - suf > a0 && b1 - suf > b0 && a[a1 - suf - 1] === b[b1 - suf - 1]) suf += 1;
  const suffix: EditSegment | null =
    suf > 0
      ? { type: 'equal', aStart: a1 - suf, aEnd: a1, bStart: b1 - suf, bEnd: b1 }
      : null;
  a1 -= suf;
  b1 -= suf;

  const n = a1 - a0;
  const m = b1 - b0;

  if (n === 0 && m > 0) {
    out.push({ type: 'insert', aStart: a0, aEnd: a0, bStart: b0, bEnd: b1 });
  } else if (m === 0 && n > 0) {
    out.push({ type: 'delete', aStart: a0, aEnd: a1, bStart: b0, bEnd: b0 });
  } else if (n > 0 && m > 0) {
    if (n === 1 && m === 1) {
      // 前后缀已裁剪，此处两行必然不同
      out.push({ type: 'delete', aStart: a0, aEnd: a1, bStart: b0, bEnd: b0 });
      out.push({ type: 'insert', aStart: a1, aEnd: a1, bStart: b0, bEnd: b1 });
    } else {
      const split = bisect(a, b, a0, a1, b0, b1);
      if (split === null) {
        // 达到搜索上限：退化为整段替换
        out.push({ type: 'delete', aStart: a0, aEnd: a1, bStart: b0, bEnd: b0 });
        out.push({ type: 'insert', aStart: a1, aEnd: a1, bStart: b0, bEnd: b1 });
      } else {
        compute(a, b, a0, split.a, b0, split.b, out);
        compute(a, b, split.a, a1, split.b, b1, out);
      }
    }
  }

  if (suffix) out.push(suffix);
}

/** 中点分割结果：把问题拆成 [a0,a) x [b0,b) 与 [a,a1) x [b,b1)。 */
interface Split {
  a: number;
  b: number;
}

/**
 * 双向搜索找到最优编辑路径的中点。
 *
 * 返回 null 表示未在上限内相遇，调用方按整段替换处理。
 */
function bisect(
  a: readonly string[],
  b: readonly string[],
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): Split | null {
  const n = a1 - a0;
  const m = b1 - b0;
  const maxD = Math.ceil((n + m) / 2);
  // 额外留出 2 格边界余量，使 k = ±d 时的 ko ± 1 访问始终落在数组内
  const offset = maxD + 1;
  const size = 2 * maxD + 4;

  const vf = new Int32Array(size).fill(-1);
  const vr = new Int32Array(size).fill(-1);
  vf[offset + 1] = 0;
  vr[offset + 1] = 0;

  const delta = n - m;
  // delta 为奇数时，前向搜索可能先与后向路径重叠；为偶数时则是后向先重叠
  const checkForward = delta % 2 !== 0;

  for (let d = 0; d <= maxD; d += 1) {
    // 前向
    for (let k = -d; k <= d; k += 2) {
      const ko = offset + k;
      let x: number;
      if (k === -d || (k !== d && vf[ko - 1] < vf[ko + 1])) {
        x = vf[ko + 1];
      } else {
        x = vf[ko - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) {
        x += 1;
        y += 1;
      }
      vf[ko] = x;
      if (x <= n && y <= m && checkForward) {
        const mirror = offset + delta - k;
        if (mirror >= 0 && mirror < size && vr[mirror] !== -1) {
          const xr = n - vr[mirror];
          if (x >= xr) return { a: a0 + x, b: b0 + y };
        }
      }
    }

    // 后向
    for (let k = -d; k <= d; k += 2) {
      const ko = offset + k;
      let x: number;
      if (k === -d || (k !== d && vr[ko - 1] < vr[ko + 1])) {
        x = vr[ko + 1];
      } else {
        x = vr[ko - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[a1 - x - 1] === b[b1 - y - 1]) {
        x += 1;
        y += 1;
      }
      vr[ko] = x;
      if (x <= n && y <= m && !checkForward) {
        const mirror = offset + delta - k;
        if (mirror >= 0 && mirror < size && vf[mirror] !== -1) {
          const xf = vf[mirror];
          const yf = xf - (mirror - offset);
          const xr = n - x;
          if (xf >= xr) return { a: a0 + xf, b: b0 + yf };
        }
      }
    }
  }

  return null;
}

/** 合并相邻同类段，保证输出规范化。 */
function mergeAdjacent(segments: EditSegment[]): EditSegment[] {
  const out: EditSegment[] = [];
  for (const seg of segments) {
    if (seg.aStart === seg.aEnd && seg.bStart === seg.bEnd) continue;
    const last = out[out.length - 1];
    if (
      last &&
      last.type === seg.type &&
      last.aEnd === seg.aStart &&
      last.bEnd === seg.bStart
    ) {
      last.aEnd = seg.aEnd;
      last.bEnd = seg.bEnd;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}
