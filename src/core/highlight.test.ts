import { describe, expect, it } from 'vitest';
import {
  highlightLine,
  highlightLines,
  isHighlightable,
  languageFromName,
  tokenizeLine,
} from './highlight';

describe('languageFromName', () => {
  it('从常见扩展名推断语言', () => {
    expect(languageFromName('app.ts')).toBe('typescript');
    expect(languageFromName('app.tsx')).toBe('tsx');
    expect(languageFromName('app.js')).toBe('javascript');
    expect(languageFromName('data.json')).toBe('json');
    expect(languageFromName('style.css')).toBe('css');
    expect(languageFromName('index.html')).toBe('html');
    expect(languageFromName('README.md')).toBe('markdown');
    expect(languageFromName('run.sh')).toBe('shell');
    expect(languageFromName('main.py')).toBe('python');
    expect(languageFromName('main.go')).toBe('go');
  });

  it('大小写不敏感', () => {
    expect(languageFromName('APP.TS')).toBe('typescript');
  });

  it('未知扩展名返回 plain', () => {
    expect(languageFromName('notes.txt')).toBe('plain');
    expect(languageFromName('没有扩展名')).toBe('plain');
  });
});

describe('tokenizeLine 无损性', () => {
  const langs = [
    'javascript',
    'typescript',
    'json',
    'css',
    'html',
    'markdown',
    'shell',
    'python',
    'go',
    'rust',
  ] as const;

  it('任何语言下 token 拼接后与原行完全一致', () => {
    const samples = [
      'const x = 42;',
      'function foo(a, b) { return a + b; }',
      'const s = "hello // world";',
      '// 这是注释',
      '/* 块注释 */',
      'let n = 0x1F;',
      'if (a && b || c) { foo(); }',
      '',
      '  缩进 + 制表符\t内容',
      'emoji 😀 和中文',
      '# 井号注释',
      'print("hi")',
    ];
    for (const lang of langs) {
      for (const sample of samples) {
        const tokens = tokenizeLine(sample, lang);
        const joined = tokens.map((t) => t.text).join('');
        expect(joined, `lang=${lang} sample=${JSON.stringify(sample)}`).toBe(sample);
      }
    }
  });
});

describe('highlightLine 关键字归类', () => {
  it('关键字着色为 keyword', () => {
    const tokens = highlightLine('const x = 1', 'javascript');
    const constToken = tokens.find((t) => t.text === 'const');
    expect(constToken?.scope).toBe('keyword');
  });

  it('字符串着色为 string', () => {
    const tokens = highlightLine('const s = "abc"', 'javascript');
    const str = tokens.find((t) => t.text === '"abc"');
    expect(str?.scope).toBe('string');
  });

  it('注释着色为 comment', () => {
    const tokens = highlightLine('// note', 'javascript');
    expect(tokens[0]?.scope).toBe('comment');
  });

  it('函数名着色为 function', () => {
    const tokens = highlightLine('foo()', 'javascript');
    const fn = tokens.find((t) => t.text === 'foo');
    expect(fn?.scope).toBe('function');
  });

  it('内置类型着色为 type', () => {
    const tokens = highlightLine('let n: number', 'typescript');
    const t = tokens.find((x) => x.text === 'number');
    expect(t?.scope).toBe('type');
  });
});

describe('highlightLines', () => {
  it('返回与行数一致的结果数组', () => {
    const lines = ['const a = 1;', 'const b = 2;', ''];
    const out = highlightLines(lines, 'javascript');
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual([]);
  });
});

describe('isHighlightable', () => {
  it('plain 不可高亮，其余可高亮', () => {
    expect(isHighlightable('plain')).toBe(false);
    expect(isHighlightable('javascript')).toBe(true);
  });
});
