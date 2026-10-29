/**
 * .gitignore 解析与匹配。
 *
 * 纯函数、零依赖，遵循 core/ 层约定。只实现 gitignore 语法的常用子集：
 * 注释、空行、`!` 取反、`/` 结尾的目录限定、根锚定、`*` / `?` / `**` 通配。
 * 不支持 `[a-z]` 字符类与反斜杠转义——实际项目的忽略文件里极少用到，
 * 为此引入完整实现不值得。
 *
 * 语义要点：规则按出现顺序应用，**后面的规则覆盖前面的**，所以 `!` 取反
 * 必须写在对应的忽略规则之后才生效，与 git 一致。
 */

/** 单条忽略规则。 */
export interface IgnoreRule {
  /** 原始模式文本，仅用于调试与提示。 */
  source: string;
  /** `!` 开头的取反规则，命中表示「不忽略」。 */
  negated: boolean;
  /** `/` 结尾，只匹配目录。 */
  dirOnly: boolean;
  regex: RegExp;
}

/** 一组忽略规则。 */
export interface IgnoreMatcher {
  rules: IgnoreRule[];
}

/**
 * 没有 .gitignore 时使用的默认忽略模式。
 *
 * 目的是避免一次遍历撞进依赖目录和构建产物里，把浏览器拖死。
 */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  'node_modules/',
  '.git/',
  '.svn/',
  '.hg/',
  'dist/',
  'build/',
  'out/',
  'target/',
  'coverage/',
  '.next/',
  '.nuxt/',
  '.turbo/',
  '.cache/',
  '.parcel-cache/',
  '.pnpm-store/',
  '.gradle/',
  '.venv/',
  '__pycache__/',
  '.idea/',
  '.vscode/',
  '.DS_Store',
  '*.log',
];

/** 始终跳过的目录名，不受 .gitignore 影响。 */
export const ALWAYS_SKIP_DIRS: readonly string[] = ['.git'];

/** 空匹配器：什么都不忽略。 */
export function emptyMatcher(): IgnoreMatcher {
  return { rules: [] };
}

/** 用默认模式构造匹配器。 */
export function defaultMatcher(): IgnoreMatcher {
  return parseGitignore(DEFAULT_IGNORE_PATTERNS.join('\n'));
}

/** 解析 .gitignore 文本。无效行被跳过。 */
export function parseGitignore(text: string): IgnoreMatcher {
  const rules: IgnoreRule[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    const rule = parseRule(line);
    if (rule) rules.push(rule);
  }
  return { rules };
}

/**
 * 判断相对路径是否被忽略。
 *
 * @param relPath 相对根目录的路径，用 `/` 分隔，不以 `/` 开头
 * @param isDir 该路径是否为目录（影响 `/` 结尾的规则）
 *
 * 注意：本函数只判断这一个路径本身。被忽略目录下的文件依赖遍历时剪枝，
 * 不在这里逐级回溯父目录。
 */
export function isIgnored(matcher: IgnoreMatcher, relPath: string, isDir: boolean): boolean {
  let ignored = false;
  for (const rule of matcher.rules) {
    if (rule.dirOnly && !isDir) continue;
    if (!rule.regex.test(relPath)) continue;
    ignored = !rule.negated;
  }
  return ignored;
}

function parseRule(rawLine: string): IgnoreRule | null {
  // 行尾空白无意义（git 要求转义才保留），行首空白保留
  let line = rawLine.replace(/\s+$/u, '');
  if (line.length === 0 || line.startsWith('#')) return null;

  const negated = line.startsWith('!');
  if (negated) line = line.slice(1);

  const dirOnly = line.endsWith('/');
  if (dirOnly) line = line.slice(0, -1);

  const rootAnchored = line.startsWith('/');
  if (rootAnchored) line = line.slice(1);
  if (line.length === 0) return null;

  // 模式中间含 '/' 时按根锚定解释；否则匹配任意层级的同名项
  const anchored = rootAnchored || line.includes('/');
  const body = globToRegexSource(line);
  const expr = anchored ? `^${body}$` : `^(?:.*/)?${body}$`;

  return { source: rawLine.trim(), negated, dirOnly, regex: new RegExp(expr, 'u') };
}

/** glob 转正则片段。`*` 不跨越 `/`，`**` 可以。 */
function globToRegexSource(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];

    if (ch === '*') {
      if (glob[i + 1] === '*') {
        const atSegmentStart = i === 0 || glob[i - 1] === '/';
        if (atSegmentStart && glob[i + 2] === '/') {
          // `a/**/b` 也要匹配 `a/b`，所以整段可选
          out += '(?:.*/)?';
          i += 2;
          continue;
        }
        out += '.*';
        i += 1;
        continue;
      }
      out += '[^/]*';
      continue;
    }

    if (ch === '?') {
      out += '[^/]';
      continue;
    }

    out += escapeRegexChar(ch);
  }
  return out;
}

function escapeRegexChar(ch: string): string {
  return /[.*+?^${}()|[\]\\]/u.test(ch) ? `\\${ch}` : ch;
}
