/**
 * 文件夹对比：按相对路径配对，并分类每一对的状态。
 *
 * 纯函数层，不碰文件系统。内容读取与哈希在 `fs/directoryAccess.ts`，
 * 这里只做配对、分类、统计与筛选，便于单测。
 *
 * 分类策略（按需求确认）：先比大小，大小不同直接判为 different；
 * 大小相同的留作 `unknown`，由上层读内容算哈希后再定。
 */

/** 一对文件的对比状态。 */
export type PairStatus =
  /** 两侧内容一致。 */
  | 'same'
  /** 两侧都有但内容不同。 */
  | 'different'
  /** 仅左侧存在。 */
  | 'leftOnly'
  /** 仅右侧存在。 */
  | 'rightOnly'
  /** 待定：两侧大小相同，需要读内容才能判断。 */
  | 'unknown';

/** 遍历得到的单个文件信息。 */
export interface FolderFileInfo {
  /** 相对根目录的路径，用 `/` 分隔。 */
  path: string;
  size: number;
}

/** 配对结果的一项。 */
export interface FilePair {
  path: string;
  status: PairStatus;
  left: FolderFileInfo | null;
  right: FolderFileInfo | null;
}

/** 文件夹对比统计。 */
export interface FolderStats {
  total: number;
  same: number;
  different: number;
  leftOnly: number;
  rightOnly: number;
  unknown: number;
}

/**
 * 按相对路径配对两侧文件列表。
 *
 * 路径大小写敏感。macOS 的文件系统默认不区分大小写，但同一路径在两侧
 * 大小写不同时按两个文件处理更保守，不会悄悄把它们当成同一个。
 */
export function pairFiles(left: FolderFileInfo[], right: FolderFileInfo[]): FilePair[] {
  const rightByPath = new Map(right.map((f) => [f.path, f]));
  const pairs: FilePair[] = [];

  for (const leftFile of left) {
    const rightFile = rightByPath.get(leftFile.path);
    if (!rightFile) {
      pairs.push({ path: leftFile.path, status: 'leftOnly', left: leftFile, right: null });
      continue;
    }
    rightByPath.delete(leftFile.path);
    pairs.push({
      path: leftFile.path,
      status: leftFile.size === rightFile.size ? 'unknown' : 'different',
      left: leftFile,
      right: rightFile,
    });
  }

  // 剩下的都是左侧没有的
  for (const rightFile of rightByPath.values()) {
    pairs.push({ path: rightFile.path, status: 'rightOnly', left: null, right: rightFile });
  }

  return pairs.sort((a, b) => comparePaths(a.path, b.path));
}

/**
 * 路径排序：逐段比较，目录层级靠前，同级按名称。
 *
 * 直接对整串 localeCompare 会让 `a/b.ts` 排在 `a.ts` 前面，逐段比较更符合
 * 文件浏览器的直觉。
 */
export function comparePaths(a: string, b: string): number {
  const as = a.split('/');
  const bs = b.split('/');
  const shared = Math.min(as.length, bs.length);

  for (let i = 0; i < shared; i += 1) {
    // 最后一段是文件名，前面的都是目录名：目录优先于同名前缀的文件
    const aIsLast = i === as.length - 1;
    const bIsLast = i === bs.length - 1;
    if (aIsLast !== bIsLast) return aIsLast ? 1 : -1;

    const cmp = as[i].localeCompare(bs[i], 'zh-Hans-CN');
    if (cmp !== 0) return cmp;
  }

  return as.length - bs.length;
}

/** 把内容比对结果写回配对列表，返回新数组。 */
export function resolvePairStatuses(
  pairs: FilePair[],
  resolutions: ReadonlyMap<string, PairStatus>,
): FilePair[] {
  if (resolutions.size === 0) return pairs;
  return pairs.map((pair) => {
    const next = resolutions.get(pair.path);
    return next && next !== pair.status ? { ...pair, status: next } : pair;
  });
}

/** 统计各状态数量。 */
export function folderStats(pairs: FilePair[]): FolderStats {
  const stats: FolderStats = {
    total: pairs.length,
    same: 0,
    different: 0,
    leftOnly: 0,
    rightOnly: 0,
    unknown: 0,
  };
  for (const pair of pairs) stats[pair.status] += 1;
  return stats;
}

/** 列表筛选选项。 */
export interface PairFilter {
  /** 显示内容一致的文件。 */
  showSame: boolean;
  /** 显示仅单侧存在的文件。 */
  showOnlyOneSide: boolean;
  /** 路径关键字，空串表示不过滤。大小写不敏感。 */
  keyword: string;
}

export const DEFAULT_PAIR_FILTER: PairFilter = {
  showSame: false,
  showOnlyOneSide: true,
  keyword: '',
};

/** 按筛选条件过滤配对列表。 */
export function filterPairs(pairs: FilePair[], filter: PairFilter): FilePair[] {
  const keyword = filter.keyword.trim().toLowerCase();
  return pairs.filter((pair) => {
    if (!filter.showSame && pair.status === 'same') return false;
    if (!filter.showOnlyOneSide && (pair.status === 'leftOnly' || pair.status === 'rightOnly')) {
      return false;
    }
    if (keyword && !pair.path.toLowerCase().includes(keyword)) return false;
    return true;
  });
}

/** 状态的中文标签，UI 统一取这里，避免各组件硬编码。 */
export function pairStatusLabel(status: PairStatus): string {
  switch (status) {
    case 'same':
      return '一致';
    case 'different':
      return '不同';
    case 'leftOnly':
      return '仅左侧';
    case 'rightOnly':
      return '仅右侧';
    case 'unknown':
      return '比对中';
  }
}
