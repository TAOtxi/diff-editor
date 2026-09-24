/**
 * 行内差异：为冲突块提供字符级高亮提示。
 *
 * 注意：行内结果仅用于显示，不作为操作单位。用户采用差异的最小单位是行块，
 * 这是需求确认过的取舍（避免行内片段级状态管理的复杂度）。
 */

import { diffSequences } from './myers';
import type { InlineLineDiff, InlineSegment } from './types';

/**
 * 按「词」切分，使高亮结果贴近人类阅读习惯。
 *
 * 规则：
 * - 连续的英文数字下划线作为一个词
 * - 连续空白作为一个词
 * - CJK 字符逐字成词（中日韩文本没有空格分隔，逐字比较粒度更合适）
 * - 其余符号逐字成词
 *
 * 用 code point 遍历，emoji 与代理对不会被拆坏。
 */
export function tokenizeInline(line: string): string[] {
  const tokens: string[] = [];
  const chars = Array.from(line);
  let buffer = '';
  let bufferKind: 'word' | 'space' | null = null;

  const flush = (): void => {
    if (buffer !== '') {
      tokens.push(buffer);
      buffer = '';
    }
    bufferKind = null;
  };

  for (const ch of chars) {
    if (isCjk(ch)) {
      flush();
      tokens.push(ch);
      continue;
    }
    if (/\s/u.test(ch)) {
      if (bufferKind !== 'space') flush();
      bufferKind = 'space';
      buffer += ch;
      continue;
    }
    if (/[\p{L}\p{N}_]/u.test(ch)) {
      if (bufferKind !== 'word') flush();
      bufferKind = 'word';
      buffer += ch;
      continue;
    }
    flush();
    tokens.push(ch);
  }
  flush();
  return tokens;
}

/** CJK 及全角标点范围判定。 */
function isCjk(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return (
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 标点
    (cp >= 0x3040 && cp <= 0x30ff) || // 日文假名
    (cp >= 0x3400 && cp <= 0x4dbf) || // 扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // 基本汉字
    (cp >= 0xf900 && cp <= 0xfaff) || // 兼容汉字
    (cp >= 0xff00 && cp <= 0xffef) || // 全角字符
    (cp >= 0xac00 && cp <= 0xd7af) || // 韩文
    (cp >= 0x20000 && cp <= 0x2ebef) // 扩展 B-F
  );
}

/** 计算一对行的行内差异。 */
export function diffInline(leftLine: string, rightLine: string): InlineLineDiff {
  if (leftLine === rightLine) {
    return {
      left: leftLine ? [{ kind: 'equal', text: leftLine }] : [],
      right: rightLine ? [{ kind: 'equal', text: rightLine }] : [],
    };
  }

  const leftTokens = tokenizeInline(leftLine);
  const rightTokens = tokenizeInline(rightLine);
  const segments = diffSequences(leftTokens, rightTokens);

  const left: InlineSegment[] = [];
  const right: InlineSegment[] = [];

  for (const seg of segments) {
    if (seg.type === 'equal') {
      const text = leftTokens.slice(seg.aStart, seg.aEnd).join('');
      pushSegment(left, 'equal', text);
      pushSegment(right, 'equal', rightTokens.slice(seg.bStart, seg.bEnd).join(''));
    } else if (seg.type === 'delete') {
      pushSegment(left, 'removed', leftTokens.slice(seg.aStart, seg.aEnd).join(''));
    } else {
      pushSegment(right, 'added', rightTokens.slice(seg.bStart, seg.bEnd).join(''));
    }
  }

  return { left, right };
}

function pushSegment(target: InlineSegment[], kind: InlineSegment['kind'], text: string): void {
  if (text === '') return;
  const last = target[target.length - 1];
  if (last && last.kind === kind) {
    last.text += text;
    return;
  }
  target.push({ kind, text });
}

/**
 * 为冲突块内的行做配对。左右行数不等时，多出的行与空串配对。
 * 返回长度为 max(左行数, 右行数) 的配对列表。
 */
export function pairConflictLines(
  leftLines: readonly string[],
  rightLines: readonly string[],
): Array<{ left: string | null; right: string | null }> {
  const len = Math.max(leftLines.length, rightLines.length);
  const out: Array<{ left: string | null; right: string | null }> = [];
  for (let i = 0; i < len; i += 1) {
    out.push({
      left: i < leftLines.length ? leftLines[i] : null,
      right: i < rightLines.length ? rightLines[i] : null,
    });
  }
  return out;
}
