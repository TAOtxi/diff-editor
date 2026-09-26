/**
 * 语法高亮：轻量级、零依赖的词法着色器。
 *
 * 设计取舍：不引入 highlight.js / Prism / Shiki 等重量级库，保持
 * 引擎层纯函数、打包体积小。用一组按行工作的正则规则做 tokenize，
 * 输出 { text, scope } 片段序列，供渲染层着色。
 *
 * 高亮只作用于「显示」，不参与差异判定，也不作为操作单位。
 * 语言由文件扩展名推断，也可由用户手动指定或关闭。
 */

/** 支持高亮的语言标识。 */
export type HighlightLanguage =
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'json'
  | 'css'
  | 'html'
  | 'xml'
  | 'markdown'
  | 'shell'
  | 'python'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'plain';

/** 词法作用域。渲染层据此映射到 CSS class。 */
export type TokenScope =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'type'
  | 'property'
  | 'operator'
  | 'punctuation'
  | 'tag'
  | 'attr'
  | 'heading'
  | 'emphasis'
  | 'plain';

/** 一个已着色的文本片段。 */
export interface HighlightToken {
  text: string;
  scope: TokenScope;
}

/** 扩展名（小写、含点）到语言标识的映射。 */
const EXTENSION_MAP: Record<string, HighlightLanguage> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.jsx': 'jsx',
  '.tsx': 'tsx',
  '.json': 'json',
  '.jsonc': 'json',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.svg': 'xml',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
};

/** 从文件名（或路径）推断语言。无法识别时返回 'plain'。 */
export function languageFromName(name: string): HighlightLanguage {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return 'plain';
  const ext = name.slice(dot).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'plain';
}

/** 某语言是否具备语法高亮（plain 表示关闭）。 */
export function isHighlightable(lang: HighlightLanguage): boolean {
  return lang !== 'plain';
}

// ---------------------------------------------------------------------------
// 规则定义
// ---------------------------------------------------------------------------

/** 单条词法规则：匹配顺序即优先级，先匹配的优先。 */
interface Rule {
  scope: TokenScope;
  pattern: RegExp;
}

/**
 * 各语言的规则集。为可读性，公共部分（注释、字符串、数字、运算符）
 * 由 `baseRules` 提供，各语言再叠加自身特有规则。
 */
const baseRules: Rule[] = [
  // 注释需在字符串之前？不：字符串内的 // 不该当注释，但这里按行工作，
  // 先匹配注释会让字符串里的 // 被误判。为简单可靠，字符串优先于注释。
  { scope: 'string', pattern: /^"(?:[^"\\\n]|\\.)*"/y },
  { scope: 'string', pattern: /^'(?:[^'\\\n]|\\.)*'/y },
  { scope: 'string', pattern: /^`(?:[^`\\]|\\.)*`/y },
  { scope: 'number', pattern: /^0[xX][0-9a-fA-F_]+/y },
  { scope: 'number', pattern: /^0[bB][01_]+/y },
  { scope: 'number', pattern: /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y },
];

function lineComment(scope: TokenScope): Rule {
  return { scope, pattern: /^\/\/.*/y };
}

function hashComment(): Rule {
  return { scope: 'comment', pattern: /^#.*/y };
}

function blockComment(): Rule {
  return { scope: 'comment', pattern: /^\/\*[\s\S]*?(?:\*\/|$)/y };
}

/** 常见关键字，覆盖 js/ts/c/java/go/rust/c# 等的交集 + 各自常见项。 */
const KEYWORDS = new Set([
  // 控制流
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break',
  'continue', 'return', 'try', 'catch', 'finally', 'throw', 'goto',
  // 声明
  'var', 'let', 'const', 'function', 'class', 'interface', 'type', 'enum',
  'struct', 'impl', 'trait', 'namespace', 'module', 'def', 'fn', 'func',
  // 修饰符
  'public', 'private', 'protected', 'static', 'final', 'abstract', 'readonly',
  'async', 'await', 'export', 'import', 'from', 'as', 'extends', 'implements',
  'override', 'virtual', 'inline', 'constexpr', 'mut', 'pub',
  // 值
  'new', 'this', 'super', 'self', 'true', 'false', 'null', 'undefined',
  'nil', 'None', 'True', 'False',
  // 其他
  'in', 'of', 'is', 'instanceof', 'typeof', 'void', 'delete', 'yield',
  'package', 'defer', 'select', 'range', 'go', 'chan', 'map',
]);

/** 常见内置类型名，单独着色为 type。 */
const TYPES = new Set([
  'string', 'number', 'boolean', 'object', 'array', 'void', 'any', 'unknown',
  'never', 'int', 'float', 'double', 'char', 'bool', 'long', 'short', 'byte',
  'uint', 'String', 'Integer', 'Boolean', 'Object', 'Symbol', 'BigInt',
  'u8', 'u16', 'u32', 'u64', 'i8', 'i16', 'i32', 'i64', 'f32', 'f64', 'usize',
]);

// 各语言规则（合并 baseRules 与语言特有规则）。
// 注意：标识符不在此列规则中，由 tokenizeLine 末尾统一识别并归类，
// 以保证关键字/类型/函数名能按上下文正确着色。
const RULES: Record<HighlightLanguage, Rule[]> = (() => {
  const cLike = (extra: Rule[] = []): Rule[] => [
    ...baseRules,
    lineComment('comment'),
    blockComment(),
    ...extra,
  ];

  const javascript: Rule[] = cLike();
  const typescript: Rule[] = javascript;
  const jsx: Rule[] = javascript;
  const tsx: Rule[] = javascript;

  const json: Rule[] = [...baseRules];

  const css: Rule[] = [
    ...baseRules,
    blockComment(),
    { scope: 'property', pattern: /^--[A-Za-z0-9-]+/y },
    { scope: 'property', pattern: /^[A-Za-z-]+(?=\s*:)/y },
    { scope: 'punctuation', pattern: /^[{};:,]/y },
    { scope: 'number', pattern: /^#(?:[0-9a-fA-F]{3,8})/y },
  ];

  const html: Rule[] = [
    { scope: 'tag', pattern: /^<\/?[A-Za-z][A-Za-z0-9-]*/y },
    { scope: 'attr', pattern: /^[A-Za-z-]+(?==)/y },
    { scope: 'string', pattern: /^"[^"]*"/y },
    { scope: 'string', pattern: /^'[^']*'/y },
    { scope: 'punctuation', pattern: /^\/?>/y },
    { scope: 'comment', pattern: /^<!--[\s\S]*?(?:-->|$)/y },
  ];

  const xml: Rule[] = html;

  const markdown: Rule[] = [
    { scope: 'heading', pattern: /^#{1,6}\s/y },
    { scope: 'emphasis', pattern: /^(\*\*|__|`)/y },
    { scope: 'operator', pattern: /^[-+*>]/y },
  ];

  const shell: Rule[] = [
    { scope: 'string', pattern: /^"(?:[^"\\]|\\.)*"/y },
    { scope: 'string', pattern: /^'(?:[^'])*'/y },
    hashComment(),
    { scope: 'operator', pattern: /^[|&<>;]/y },
    { scope: 'plain', pattern: /^\$[A-Za-z_][A-Za-z0-9_]*/y },
  ];

  const python: Rule[] = [
    { scope: 'string', pattern: /^"(?:[^"\\\n]|\\.)*"/y },
    { scope: 'string', pattern: /^'(?:[^'\\\n]|\\.)*'/y },
    { scope: 'string', pattern: /^"""[\s\S]*?(?:"""|$)/y },
    hashComment(),
    { scope: 'number', pattern: /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y },
  ];

  const go: Rule[] = cLike();

  const rust: Rule[] = cLike([
    { scope: 'string', pattern: /^r#?"(?:[^"\\]|\\.)*"#?/y },
    { scope: 'type', pattern: /^[A-Z][A-Za-z0-9_]*/y },
  ]);

  const plain: Rule[] = [];

  return {
    javascript,
    typescript,
    jsx,
    tsx,
    json,
    css,
    html,
    xml,
    markdown,
    shell,
    python,
    java: javascript,
    c: javascript,
    cpp: javascript,
    csharp: javascript,
    go,
    rust,
    plain,
  };
})();

// ---------------------------------------------------------------------------
// 分词
// ---------------------------------------------------------------------------

/**
 * 对单行文本做词法着色。
 *
 * 按规则顺序贪心匹配；无法匹配任何规则时按单字符推进，保证
 * 输出的 text 拼接后与原行完全一致（无损）。
 */
export function tokenizeLine(line: string, lang: HighlightLanguage): HighlightToken[] {
  const rules = RULES[lang];
  if (!rules || rules.length === 0) {
    return line === '' ? [] : [{ text: line, scope: 'plain' }];
  }

  const tokens: HighlightToken[] = [];
  let pos = 0;

  while (pos < line.length) {
    const rest = line.slice(pos);
    let matched = false;

    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      const m = rule.pattern.exec(rest);
      if (m && m[0].length > 0) {
        tokens.push({ text: m[0], scope: rule.scope });
        pos += m[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // 标识符：识别后按关键字/类型/函数名归类
      const identMatch = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(rest);
      if (identMatch && identMatch[0].length > 0) {
        const text = identMatch[0];
        const after = line[pos + text.length];
        let scope: TokenScope = 'plain';
        if (KEYWORDS.has(text)) scope = 'keyword';
        else if (TYPES.has(text)) scope = 'type';
        else if (after === '(') scope = 'function';
        tokens.push({ text, scope });
        pos += text.length;
        matched = true;
      }
    }

    if (!matched) {
      tokens.push({ text: line[pos], scope: 'plain' });
      pos += 1;
    }
  }

  return mergeSameScope(tokens);
}

/** 完整入口：对单行文本做词法着色。 */
export function highlightLine(line: string, lang: HighlightLanguage): HighlightToken[] {
  return tokenizeLine(line, lang);
}

/** 合并相邻同 scope 的片段，减少 DOM 节点数量。 */
function mergeSameScope(tokens: HighlightToken[]): HighlightToken[] {
  const out: HighlightToken[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.scope === t.scope) {
      last.text += t.text;
    } else {
      out.push({ ...t });
    }
  }
  return out;
}

/** 对多行批量高亮（供 hook 层使用）。 */
export function highlightLines(
  lines: readonly string[],
  lang: HighlightLanguage,
): HighlightToken[][] {
  return lines.map((line) => highlightLine(line, lang));
}
