/**
 * 目录级 File System Access 封装：选目录、递归遍历、内容比对。
 *
 * 与 `fileAccess.ts` 的分工：那边处理单个文件的读写与元信息，这边只负责
 * 「把一个目录展开成文件清单」和「判断两个文件内容是否相同」。
 *
 * 忽略规则（按需求确认）：目录根有 .gitignore 就以它为准，没有则用
 * `DEFAULT_IGNORE_PATTERNS`。`.git` 始终跳过。只读根目录的 .gitignore，
 * 不处理子目录里的嵌套 .gitignore——多数项目够用，实现也简单得多。
 */

import {
  ALWAYS_SKIP_DIRS,
  defaultMatcher,
  isIgnored,
  parseGitignore,
  type IgnoreMatcher,
} from '../core/gitignore';
import type { FolderFileInfo, PairStatus } from '../core/folder';

/** 单次遍历的文件数上限，超过即停止，避免误选巨大目录卡死页面。 */
export const MAX_SCAN_FILES = 20_000;

/** 目录遍历结果。 */
export interface ScanResult {
  files: FolderFileInfo[];
  /**
   * 相对路径 → 文件句柄。
   *
   * 遍历时顺手收下，之后打开某一对文件就不必再按路径逐层 getDirectoryHandle。
   * 句柄本身不缓存内容，每次 getFile() 都会重新读盘，不存在读到旧内容的问题。
   */
  handles: Map<string, FileSystemFileHandle>;
  /** 被忽略规则跳过的条目数（含目录），仅用于提示。 */
  skipped: number;
  /** 是否因触达 MAX_SCAN_FILES 而提前结束。 */
  truncated: boolean;
  /** 忽略规则来自 .gitignore 还是内置默认值。 */
  ignoreSource: 'gitignore' | 'default';
}

/** 浏览器是否支持目录选择。 */
export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * 通过系统选择器打开文件夹。用户取消返回 null。
 *
 * 直接申请 readwrite：对比后大概率要把结果写回原文件，一次授权比之后
 * 保存时再弹一次更顺。
 */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isDirectoryPickerSupported()) {
    throw new Error('当前浏览器不支持选择文件夹，请使用 Chrome。');
  }
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

/** 读取目录根部的 .gitignore，不存在返回 null。 */
async function readRootGitignore(root: FileSystemDirectoryHandle): Promise<string | null> {
  try {
    const handle = await root.getFileHandle('.gitignore');
    const file = await handle.getFile();
    return await file.text();
  } catch {
    // NotFoundError 或读取失败都按「没有 .gitignore」处理
    return null;
  }
}

/** 构造目录对应的忽略匹配器。 */
export async function buildIgnoreMatcher(
  root: FileSystemDirectoryHandle,
): Promise<{ matcher: IgnoreMatcher; source: 'gitignore' | 'default' }> {
  const text = await readRootGitignore(root);
  if (text === null) return { matcher: defaultMatcher(), source: 'default' };
  return { matcher: parseGitignore(text), source: 'gitignore' };
}

/**
 * 递归遍历目录，返回相对路径文件清单。
 *
 * @param onProgress 每发现若干文件回调一次，用于 UI 显示进度
 */
export async function scanDirectory(
  root: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void,
): Promise<ScanResult> {
  const { matcher, source } = await buildIgnoreMatcher(root);
  const files: FolderFileInfo[] = [];
  const handles = new Map<string, FileSystemFileHandle>();
  let skipped = 0;
  let truncated = false;

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    if (truncated) return;

    for await (const entry of dir.values()) {
      if (truncated) return;

      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.kind === 'directory') {
        if (ALWAYS_SKIP_DIRS.includes(entry.name) || isIgnored(matcher, relPath, true)) {
          skipped += 1;
          continue;
        }
        await walk(entry as FileSystemDirectoryHandle, relPath);
        continue;
      }

      if (isIgnored(matcher, relPath, false)) {
        skipped += 1;
        continue;
      }

      const fileHandle = entry as FileSystemFileHandle;
      let size: number;
      try {
        size = (await fileHandle.getFile()).size;
      } catch {
        // 读不到（权限或已被删除）就跳过，不让整次遍历失败
        skipped += 1;
        continue;
      }

      files.push({ path: relPath, size });
      handles.set(relPath, fileHandle);
      if (files.length >= MAX_SCAN_FILES) {
        truncated = true;
        return;
      }
      if (onProgress && files.length % 200 === 0) onProgress(files.length);
    }
  }

  await walk(root, '');
  onProgress?.(files.length);

  return { files, handles, skipped, truncated, ignoreSource: source };
}

/** 同时进行的内容比对数量。太高会让磁盘随机读变成瓶颈。 */
const COMPARE_CONCURRENCY = 8;

/**
 * 判断两个文件内容是否逐字节相同。
 *
 * 大小已相同才会走到这里（见 `core/folder.pairFiles`）。这里直接比字节而不是
 * 算 SHA-256 再比摘要：成对比较只需一次遍历，首个不同字节即可短路返回，
 * 既比哈希快，也不存在碰撞的理论风险。
 */
export async function sameContent(
  left: FileSystemFileHandle,
  right: FileSystemFileHandle,
): Promise<boolean> {
  const [leftFile, rightFile] = await Promise.all([left.getFile(), right.getFile()]);
  if (leftFile.size !== rightFile.size) return false;

  const [leftBuf, rightBuf] = await Promise.all([leftFile.arrayBuffer(), rightFile.arrayBuffer()]);
  const a = new Uint8Array(leftBuf);
  const b = new Uint8Array(rightBuf);
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** 需要内容比对的一项。 */
export interface PendingCompare {
  path: string;
  left: FileSystemFileHandle;
  right: FileSystemFileHandle;
}

/**
 * 并发比对多组文件，返回 path → 状态。
 *
 * 读取失败的那一项按 different 处理：宁可让用户点进去看，也不要谎报一致。
 */
export async function compareContents(
  items: PendingCompare[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, PairStatus>> {
  const result = new Map<string, PairStatus>();
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      try {
        result.set(item.path, (await sameContent(item.left, item.right)) ? 'same' : 'different');
      } catch {
        result.set(item.path, 'different');
      }
      done += 1;
      if (onProgress && (done % 50 === 0 || done === items.length)) {
        onProgress(done, items.length);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(COMPARE_CONCURRENCY, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return result;
}
