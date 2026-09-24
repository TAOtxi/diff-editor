import { describe, expect, it } from 'vitest';
import {
  BOM,
  detectEol,
  expandTabs,
  isBlank,
  joinLines,
  looksBinary,
  normalizeLine,
  splitLines,
  toCodePoints,
} from './text';
import { DEFAULT_COMPARE_OPTIONS } from './types';

describe('detectEol', () => {
  it('纯 LF', () => expect(detectEol('a\nb\n')).toBe('lf'));
  it('纯 CRLF', () => expect(detectEol('a\r\nb\r\n')).toBe('crlf'));
  it('纯 CR', () => expect(detectEol('a\rb\r')).toBe('cr'));
  it('无换行时默认 LF', () => expect(detectEol('abc')).toBe('lf'));
  it('混用时取多数', () => expect(detectEol('a\r\nb\r\nc\n')).toBe('crlf'));
  it('LF 与 CRLF 并列时优先 LF', () => expect(detectEol('a\r\nb\n')).toBe('lf'));
});

describe('splitLines 与 joinLines 往返', () => {
  const cases: string[] = [
    '',
    'a',
    'a\n',
    'a\nb',
    'a\nb\n',
    'a\r\nb\r\n',
    'a\rb\r',
    '\n',
    '\n\n\n',
    'line1\n\nline3\n',
    `${BOM}a\nb\n`,
    '末尾无换行',
    '中文内容\n第二行\n',
    '😀 emoji\n第二行😀\n',
  ];

  for (const raw of cases) {
    it(`往返保持一致: ${JSON.stringify(raw)}`, () => {
      const { lines, meta } = splitLines(raw);
      expect(joinLines(lines, meta)).toBe(raw);
    });
  }

  it('空文本切分为空数组', () => {
    const { lines, meta } = splitLines('');
    expect(lines).toEqual([]);
    expect(meta.endsWithNewline).toBe(false);
  });

  it('单个换行符切分为一个空行', () => {
    const { lines, meta } = splitLines('\n');
    expect(lines).toEqual(['']);
    expect(meta.endsWithNewline).toBe(true);
  });

  it('末尾无换行被记录', () => {
    const { lines, meta } = splitLines('a\nb');
    expect(lines).toEqual(['a', 'b']);
    expect(meta.endsWithNewline).toBe(false);
  });

  it('BOM 被剥离并记录', () => {
    const { lines, meta } = splitLines(`${BOM}hello`);
    expect(lines).toEqual(['hello']);
    expect(meta.hasBom).toBe(true);
  });
});

describe('looksBinary', () => {
  it('普通文本不是二进制', () => expect(looksBinary('hello 世界')).toBe(false));
  it('含 NUL 字节视为二进制', () => expect(looksBinary('a\u0000b')).toBe(true));
  it('空文本不是二进制', () => expect(looksBinary('')).toBe(false));
});

describe('expandTabs', () => {
  it('不展开时原样返回', () => expect(expandTabs('a\tb', 0)).toBe('a\tb'));
  it('按列对齐展开', () => expect(expandTabs('a\tb', 4)).toBe('a   b'));
  it('行首制表符占满一格', () => expect(expandTabs('\tx', 4)).toBe('    x'));
  it('无制表符原样返回', () => expect(expandTabs('abc', 4)).toBe('abc'));
});

describe('normalizeLine', () => {
  it('默认不做任何归一化', () => {
    expect(normalizeLine('  A b  ', DEFAULT_COMPARE_OPTIONS)).toBe('  A b  ');
  });

  it('忽略行尾空白', () => {
    const opts = { ...DEFAULT_COMPARE_OPTIONS, ignoreTrailingWhitespace: true };
    expect(normalizeLine('a b   ', opts)).toBe('a b');
    expect(normalizeLine('  a b', opts)).toBe('  a b');
  });

  it('忽略全部空白', () => {
    const opts = { ...DEFAULT_COMPARE_OPTIONS, ignoreAllWhitespace: true };
    expect(normalizeLine('  a  b  ', opts)).toBe('ab');
  });

  it('忽略大小写', () => {
    const opts = { ...DEFAULT_COMPARE_OPTIONS, ignoreCase: true };
    expect(normalizeLine('AbC', opts)).toBe('abc');
  });

  it('忽略全部空白优先于忽略行尾空白', () => {
    const opts = {
      ...DEFAULT_COMPARE_OPTIONS,
      ignoreAllWhitespace: true,
      ignoreTrailingWhitespace: true,
    };
    expect(normalizeLine(' a b ', opts)).toBe('ab');
  });
});

describe('isBlank', () => {
  it('空串是空白', () => expect(isBlank('')).toBe(true));
  it('纯空格是空白', () => expect(isBlank('   \t')).toBe(true));
  it('有内容不是空白', () => expect(isBlank(' a ')).toBe(false));
});

describe('toCodePoints', () => {
  it('emoji 不被拆坏', () => {
    expect(toCodePoints('a😀b')).toEqual(['a', '😀', 'b']);
  });
  it('中文逐字', () => {
    expect(toCodePoints('中文')).toEqual(['中', '文']);
  });
});
