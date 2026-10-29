import {
  DEFAULT_IGNORE_PATTERNS,
  defaultMatcher,
  emptyMatcher,
  isIgnored,
  parseGitignore,
} from './gitignore';

describe('parseGitignore 跳过无效行', () => {
  it('忽略注释与空行', () => {
    const m = parseGitignore('# comment\n\n   \nnode_modules/\n');
    expect(m.rules).toHaveLength(1);
    expect(m.rules[0].source).toBe('node_modules/');
  });

  it('单独的 / 与 ! 不产生规则', () => {
    expect(parseGitignore('/\n!\n!/').rules).toHaveLength(0);
  });

  it('空匹配器什么都不忽略', () => {
    expect(isIgnored(emptyMatcher(), 'anything', false)).toBe(false);
  });
});

describe('基本匹配', () => {
  it('裸名称匹配任意层级', () => {
    const m = parseGitignore('dist');
    expect(isIgnored(m, 'dist', true)).toBe(true);
    expect(isIgnored(m, 'packages/app/dist', true)).toBe(true);
    expect(isIgnored(m, 'dist2', true)).toBe(false);
  });

  it('根锚定只匹配顶层', () => {
    const m = parseGitignore('/dist');
    expect(isIgnored(m, 'dist', true)).toBe(true);
    expect(isIgnored(m, 'packages/dist', true)).toBe(false);
  });

  it('含中间斜杠的模式按根锚定解释', () => {
    const m = parseGitignore('src/generated');
    expect(isIgnored(m, 'src/generated', true)).toBe(true);
    expect(isIgnored(m, 'packages/src/generated', true)).toBe(false);
  });

  it('目录限定规则不匹配同名文件', () => {
    const m = parseGitignore('build/');
    expect(isIgnored(m, 'build', true)).toBe(true);
    expect(isIgnored(m, 'build', false)).toBe(false);
  });
});

describe('通配符', () => {
  it('* 不跨越路径分隔符', () => {
    const m = parseGitignore('*.log');
    expect(isIgnored(m, 'debug.log', false)).toBe(true);
    expect(isIgnored(m, 'logs/debug.log', false)).toBe(true);
    expect(isIgnored(m, 'debug.log.txt', false)).toBe(false);
  });

  it('? 匹配单个字符', () => {
    const m = parseGitignore('file?.txt');
    expect(isIgnored(m, 'file1.txt', false)).toBe(true);
    expect(isIgnored(m, 'file12.txt', false)).toBe(false);
  });

  it('a/**/b 也匹配 a/b', () => {
    const m = parseGitignore('src/**/tmp');
    expect(isIgnored(m, 'src/tmp', true)).toBe(true);
    expect(isIgnored(m, 'src/a/tmp', true)).toBe(true);
    expect(isIgnored(m, 'src/a/b/tmp', true)).toBe(true);
    expect(isIgnored(m, 'lib/tmp', true)).toBe(false);
  });

  it('**/ 前缀匹配任意层级', () => {
    const m = parseGitignore('**/fixtures');
    expect(isIgnored(m, 'fixtures', true)).toBe(true);
    expect(isIgnored(m, 'test/unit/fixtures', true)).toBe(true);
  });

  it('尾部 /** 匹配目录内容但不匹配目录本身', () => {
    const m = parseGitignore('docs/**');
    expect(isIgnored(m, 'docs/a.md', false)).toBe(true);
    expect(isIgnored(m, 'docs/a/b.md', false)).toBe(true);
    expect(isIgnored(m, 'docs', true)).toBe(false);
  });

  it('点号按字面量匹配', () => {
    const m = parseGitignore('a.txt');
    expect(isIgnored(m, 'axtxt', false)).toBe(false);
  });
});

describe('取反规则按顺序生效', () => {
  it('后面的 ! 能重新包含', () => {
    const m = parseGitignore('*.log\n!important.log');
    expect(isIgnored(m, 'debug.log', false)).toBe(true);
    expect(isIgnored(m, 'important.log', false)).toBe(false);
  });

  it('顺序颠倒时 ! 不生效', () => {
    const m = parseGitignore('!important.log\n*.log');
    expect(isIgnored(m, 'important.log', false)).toBe(true);
  });
});

describe('默认忽略模式', () => {
  it('覆盖常见依赖与产物目录', () => {
    const m = defaultMatcher();
    expect(isIgnored(m, 'node_modules', true)).toBe(true);
    expect(isIgnored(m, 'packages/app/node_modules', true)).toBe(true);
    expect(isIgnored(m, 'dist', true)).toBe(true);
    expect(isIgnored(m, '.git', true)).toBe(true);
    expect(isIgnored(m, 'src/index.ts', false)).toBe(false);
  });

  it('模式列表非空且都能解析', () => {
    expect(DEFAULT_IGNORE_PATTERNS.length).toBeGreaterThan(0);
    expect(defaultMatcher().rules).toHaveLength(DEFAULT_IGNORE_PATTERNS.length);
  });
});
