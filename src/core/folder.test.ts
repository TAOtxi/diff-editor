import {
  DEFAULT_PAIR_FILTER,
  comparePaths,
  filterPairs,
  folderStats,
  pairFiles,
  pairStatusLabel,
  resolvePairStatuses,
  type FilePair,
  type FolderFileInfo,
  type PairStatus,
} from './folder';

function f(path: string, size: number): FolderFileInfo {
  return { path, size };
}

describe('pairFiles 配对与初判', () => {
  it('大小不同直接判为 different', () => {
    const pairs = pairFiles([f('a.ts', 10)], [f('a.ts', 12)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].status).toBe('different');
  });

  it('大小相同留作 unknown 待内容比对', () => {
    const pairs = pairFiles([f('a.ts', 10)], [f('a.ts', 10)]);
    expect(pairs[0].status).toBe('unknown');
    expect(pairs[0].left).not.toBeNull();
    expect(pairs[0].right).not.toBeNull();
  });

  it('单侧存在分别标记 leftOnly / rightOnly', () => {
    const pairs = pairFiles([f('only-left.ts', 1)], [f('only-right.ts', 1)]);
    const byPath = new Map(pairs.map((p) => [p.path, p]));
    expect(byPath.get('only-left.ts')?.status).toBe('leftOnly');
    expect(byPath.get('only-left.ts')?.right).toBeNull();
    expect(byPath.get('only-right.ts')?.status).toBe('rightOnly');
    expect(byPath.get('only-right.ts')?.left).toBeNull();
  });

  it('两侧都空得到空列表', () => {
    expect(pairFiles([], [])).toEqual([]);
  });

  it('每个路径只出现一次', () => {
    const pairs = pairFiles(
      [f('a.ts', 1), f('b.ts', 2), f('c.ts', 3)],
      [f('b.ts', 2), f('c.ts', 9), f('d.ts', 4)],
    );
    expect(pairs.map((p) => p.path)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
  });

  it('路径大小写不同视为两个文件', () => {
    const pairs = pairFiles([f('A.ts', 1)], [f('a.ts', 1)]);
    expect(pairs).toHaveLength(2);
  });
});

describe('comparePaths 排序', () => {
  it('目录层级排在同级文件之前', () => {
    expect(comparePaths('a/b.ts', 'a.ts')).toBeLessThan(0);
  });

  it('同级按名称', () => {
    expect(comparePaths('src/a.ts', 'src/b.ts')).toBeLessThan(0);
    expect(comparePaths('src/b.ts', 'src/a.ts')).toBeGreaterThan(0);
    expect(comparePaths('src/a.ts', 'src/a.ts')).toBe(0);
  });

  it('不同目录按目录名', () => {
    expect(comparePaths('lib/z.ts', 'src/a.ts')).toBeLessThan(0);
  });

  it('pairFiles 输出已排序', () => {
    const pairs = pairFiles([f('z.ts', 1), f('src/a.ts', 1), f('a.ts', 1)], []);
    expect(pairs.map((p) => p.path)).toEqual(['src/a.ts', 'a.ts', 'z.ts']);
  });
});

describe('resolvePairStatuses', () => {
  const pairs = pairFiles([f('a.ts', 10), f('b.ts', 10)], [f('a.ts', 10), f('b.ts', 10)]);

  it('写回内容比对结果', () => {
    const resolutions = new Map<string, PairStatus>([
      ['a.ts', 'same'],
      ['b.ts', 'different'],
    ]);
    const next = resolvePairStatuses(pairs, resolutions);
    expect(next.map((p) => p.status)).toEqual(['same', 'different']);
  });

  it('空结果返回原数组引用', () => {
    expect(resolvePairStatuses(pairs, new Map())).toBe(pairs);
  });

  it('未涉及的项保持原对象引用', () => {
    const next = resolvePairStatuses(pairs, new Map<string, PairStatus>([['a.ts', 'same']]));
    expect(next[1]).toBe(pairs[1]);
  });
});

describe('folderStats', () => {
  it('分状态计数', () => {
    const pairs: FilePair[] = [
      { path: 'a', status: 'same', left: f('a', 1), right: f('a', 1) },
      { path: 'b', status: 'different', left: f('b', 1), right: f('b', 2) },
      { path: 'c', status: 'leftOnly', left: f('c', 1), right: null },
      { path: 'd', status: 'rightOnly', left: null, right: f('d', 1) },
      { path: 'e', status: 'unknown', left: f('e', 1), right: f('e', 1) },
    ];
    expect(folderStats(pairs)).toEqual({
      total: 5,
      same: 1,
      different: 1,
      leftOnly: 1,
      rightOnly: 1,
      unknown: 1,
    });
  });
});

describe('filterPairs', () => {
  const pairs: FilePair[] = [
    { path: 'src/same.ts', status: 'same', left: f('src/same.ts', 1), right: f('src/same.ts', 1) },
    { path: 'src/diff.ts', status: 'different', left: f('src/diff.ts', 1), right: f('src/diff.ts', 2) },
    { path: 'docs/left.md', status: 'leftOnly', left: f('docs/left.md', 1), right: null },
  ];

  it('默认隐藏一致文件、保留单侧文件', () => {
    const out = filterPairs(pairs, DEFAULT_PAIR_FILTER);
    expect(out.map((p) => p.path)).toEqual(['src/diff.ts', 'docs/left.md']);
  });

  it('showSame 打开后包含一致文件', () => {
    const out = filterPairs(pairs, { ...DEFAULT_PAIR_FILTER, showSame: true });
    expect(out).toHaveLength(3);
  });

  it('关闭 showOnlyOneSide 隐藏单侧文件', () => {
    const out = filterPairs(pairs, { ...DEFAULT_PAIR_FILTER, showOnlyOneSide: false });
    expect(out.map((p) => p.path)).toEqual(['src/diff.ts']);
  });

  it('关键字大小写不敏感且匹配整条路径', () => {
    const out = filterPairs(pairs, { ...DEFAULT_PAIR_FILTER, keyword: 'DOCS/' });
    expect(out.map((p) => p.path)).toEqual(['docs/left.md']);
  });

  it('关键字仅空白视为不过滤', () => {
    expect(filterPairs(pairs, { ...DEFAULT_PAIR_FILTER, keyword: '   ' })).toHaveLength(2);
  });
});

describe('pairStatusLabel', () => {
  it('五种状态都有中文标签', () => {
    const statuses: PairStatus[] = ['same', 'different', 'leftOnly', 'rightOnly', 'unknown'];
    for (const status of statuses) {
      expect(pairStatusLabel(status)).toMatch(/\S/);
    }
  });
});
