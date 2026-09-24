/**
 * 文本层：行切分、行尾探测、BOM、二进制判定、对比归一化。
 *
 * 全部为纯函数，便于单测覆盖边界用例。
 */

import type { CompareOptions, Eol } from './types';

/** 大文件阈值：字节。超过后 UI 需询问用户是否继续。 */
export const LARGE_FILE_BYTES = 5 * 1024 * 1024;

/** 大文件阈值：行数。 */
export const LARGE_FILE_LINES = 100_000;

/** UTF-8 BOM 字符。 */
export const BOM = '\uFEFF';

/** 文档的文本元信息，保存时需原样还原。 */
export interface TextMeta {
  eol: Eol;
  hasBom: boolean;
  /** 原文末尾是否有换行符。 */
  endsWithNewline: boolean;
}

export const DEFAULT_TEXT_META: TextMeta = {
  eol: 'lf',
  hasBom: false,
  endsWithNewline: true,
};

/**
 * 探测主要行尾风格。混用时取出现次数最多的一种，并列时优先 LF。
 */
export function detectEol(text: string): Eol {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        crlf += 1;
        i += 1;
      } else {
        cr += 1;
      }
    } else if (ch === '\n') {
      lf += 1;
    }
  }
  if (crlf > lf && crlf >= cr) return 'crlf';
  if (cr > lf && cr > crlf) return 'cr';
  return 'lf';
}

/** 行尾枚举转实际字符串。 */
export function eolString(eol: Eol): string {
  if (eol === 'crlf') return '\r\n';
  if (eol === 'cr') return '\r';
  return '\n';
}

/**
 * 二进制判定：出现 NUL 字节即视为二进制。
 * 只检查前 8KB，足够识别常见二进制格式且避免遍历大文件。
 */
export function looksBinary(text: string): boolean {
  const limit = Math.min(text.length, 8192);
  for (let i = 0; i < limit; i += 1) {
    if (text.charCodeAt(i) === 0) return true;
  }
  return false;
}

/**
 * 把原始文本切分为行数组，并提取需要在保存时还原的元信息。
 *
 * 约定：行数组不含行尾符。「末尾有换行」通过 meta.endsWithNewline 记录，
 * 而不是在数组尾部保留一个空串，这样行数与用户看到的行号一致。
 * 空文本切分为空数组。
 */
export function splitLines(raw: string): { lines: string[]; meta: TextMeta } {
  const hasBom = raw.startsWith(BOM);
  const text = hasBom ? raw.slice(BOM.length) : raw;
  const eol = detectEol(text);

  if (text.length === 0) {
    return { lines: [], meta: { eol, hasBom, endsWithNewline: false } };
  }

  const lines = text.split(/\r\n|\n|\r/);
  const endsWithNewline = lines.length > 1 && lines[lines.length - 1] === '';
  if (endsWithNewline) lines.pop();

  return { lines, meta: { eol, hasBom, endsWithNewline } };
}

/** 行数组还原为文本，保留原有行尾风格、BOM 与末尾换行。 */
export function joinLines(lines: string[], meta: TextMeta): string {
  const sep = eolString(meta.eol);
  let text = lines.join(sep);
  if (meta.endsWithNewline && lines.length > 0) text += sep;
  return meta.hasBom ? BOM + text : text;
}

/** 按 tabWidth 展开制表符，按可视列对齐而非简单替换。 */
export function expandTabs(line: string, tabWidth: number): string {
  if (tabWidth <= 0 || !line.includes('\t')) return line;
  let out = '';
  for (const ch of line) {
    if (ch === '\t') {
      const pad = tabWidth - (out.length % tabWidth);
      out += ' '.repeat(pad);
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 生成用于相等性比较的行键。
 *
 * 归一化只影响「是否算作差异」的判定，不修改文档内容本身，
 * 因此显示与保存始终是用户的原始文本。
 */
export function normalizeLine(line: string, options: CompareOptions): string {
  let out = line;
  if (options.tabWidth > 0) out = expandTabs(out, options.tabWidth);
  if (options.ignoreAllWhitespace) {
    out = out.replace(/\s+/gu, '');
  } else if (options.ignoreTrailingWhitespace) {
    out = out.replace(/[ \t]+$/u, '');
  }
  if (options.ignoreCase) out = out.toLowerCase();
  return out;
}

/** 是否为空白行（用于 ignoreBlankLines）。 */
export function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** 按 code point 切分，避免把 emoji 与代理对拆坏。 */
export function toCodePoints(text: string): string[] {
  return Array.from(text);
}
