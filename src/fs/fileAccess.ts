/**
 * File System Access API 封装。
 *
 * 按需求确认：目标浏览器为 Chrome，不做降级方案。
 * 启动时用 isFileSystemAccessSupported 做一次能力检测并明确提示，
 * 而不是静默退化成下载，避免用户以为已经写回原文件。
 */

import { LARGE_FILE_BYTES, LARGE_FILE_LINES, looksBinary, splitLines, type TextMeta } from '../core/text';

/** 浏览器是否支持直接读写本地文件。 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showOpenFilePicker' in window &&
    'showSaveFilePicker' in window
  );
}

/** 读取结果。 */
export interface LoadedFile {
  lines: string[];
  meta: TextMeta;
  name: string;
  bytes: number;
  handle: FileSystemFileHandle | null;
}

/** 读取过程中的可恢复问题，交由 UI 决定是否继续。 */
export class FileLoadWarning extends Error {
  constructor(
    message: string,
    readonly kind: 'binary' | 'tooLarge',
  ) {
    super(message);
    this.name = 'FileLoadWarning';
  }
}

/**
 * 把 File 对象解析为行数组。
 *
 * @param force 为 true 时跳过二进制与大文件检查（用户已确认继续）
 */
export async function readFile(
  file: File,
  handle: FileSystemFileHandle | null,
  force = false,
): Promise<LoadedFile> {
  if (!force && file.size > LARGE_FILE_BYTES) {
    throw new FileLoadWarning(
      `文件体积 ${formatBytes(file.size)}，超过 ${formatBytes(LARGE_FILE_BYTES)} 阈值，继续打开可能造成卡顿。`,
      'tooLarge',
    );
  }

  const raw = await file.text();

  if (!force && looksBinary(raw)) {
    throw new FileLoadWarning('文件包含 NUL 字节，可能是二进制文件，按文本打开会显示乱码。', 'binary');
  }

  const { lines, meta } = splitLines(raw);

  if (!force && lines.length > LARGE_FILE_LINES) {
    throw new FileLoadWarning(
      `文件共 ${lines.length} 行，超过 ${LARGE_FILE_LINES} 行阈值，继续打开可能造成卡顿。`,
      'tooLarge',
    );
  }

  return { lines, meta, name: file.name, bytes: file.size, handle };
}

/** 通过系统文件选择器打开文件，返回可写回的句柄。 */
export async function pickFile(): Promise<{ file: File; handle: FileSystemFileHandle } | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('当前浏览器不支持 File System Access API，请使用 Chrome。');
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: '文本文件',
          accept: { 'text/*': ['.txt', '.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.xml', '.yml', '.yaml', '.kt', '.java', '.swift', '.py', '.sh'] },
        },
      ],
      excludeAcceptAllOption: false,
    });
    const file = await handle.getFile();
    return { file, handle };
  } catch (err) {
    // 用户取消不算错误
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

/** 写回已有句柄。调用前需确认权限。 */
export async function writeToHandle(handle: FileSystemFileHandle, content: string): Promise<void> {
  const permission = await ensureWritePermission(handle);
  if (!permission) {
    throw new Error('没有写入该文件的权限，请重新授权或使用「另存为」。');
  }
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

/** 确认或申请写权限。 */
async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const options = { mode: 'readwrite' as const };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

/** 另存为，返回新句柄。用户取消返回 null。 */
export async function saveAs(
  suggestedName: string,
  content: string,
): Promise<FileSystemFileHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('当前浏览器不支持 File System Access API，请使用 Chrome。');
  }
  try {
    const handle = await window.showSaveFilePicker({ suggestedName });
    const writable = await handle.createWritable();
    try {
      await writable.write(content);
    } finally {
      await writable.close();
    }
    return handle;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

/** 字节数格式化，用于提示文案。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
