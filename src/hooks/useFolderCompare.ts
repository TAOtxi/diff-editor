/**
 * 文件夹对比编排：选目录 → 递归遍历 → 按路径配对 → 内容比对。
 *
 * 放 hooks/ 而不是塞进 App.tsx，是因为这条流程有自己的异步状态机
 * （扫描中 / 比对中 / 就绪）和一组不可序列化的句柄。
 *
 * 目录句柄与文件句柄都放 ref，与 App 里 handlesRef 的理由一致：
 * 不可序列化，也不该进撤销历史。
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  pairFiles,
  resolvePairStatuses,
  type FilePair,
} from '../core/folder';
import type { Side } from '../core/types';
import {
  MAX_SCAN_FILES,
  compareContents,
  isDirectoryPickerSupported,
  pickDirectory,
  scanDirectory,
  type PendingCompare,
  type ScanResult,
} from '../fs/directoryAccess';

/** 对比流程所处阶段。 */
export type FolderPhase = 'idle' | 'scanning' | 'comparing' | 'ready';

interface SideScan {
  handle: FileSystemDirectoryHandle;
  name: string;
  result: ScanResult;
}

export interface FolderCompareApi {
  supported: boolean;
  names: Record<Side, string | null>;
  pairs: FilePair[];
  phase: FolderPhase;
  /** 进度文案，空闲时为 null。 */
  progress: string | null;
  warnings: string[];
  /** 两侧都已选好目录。 */
  ready: boolean;
  pick: (side: Side) => Promise<void>;
  rescan: () => Promise<void>;
  reset: () => void;
  handlesFor: (path: string) => {
    left: FileSystemFileHandle | null;
    right: FileSystemFileHandle | null;
  };
}

const SIDES: readonly Side[] = ['left', 'right'];

function sideLabel(side: Side): string {
  return side === 'left' ? '左侧' : '右侧';
}

export function useFolderCompare(onError: (message: string) => void): FolderCompareApi {
  const supported = useMemo(() => isDirectoryPickerSupported(), []);
  const scansRef = useRef<Record<Side, SideScan | null>>({ left: null, right: null });
  /** 自增序号，用于丢弃被新一轮取代的过期比对结果。 */
  const seqRef = useRef(0);

  const [names, setNames] = useState<Record<Side, string | null>>({ left: null, right: null });
  const [pairs, setPairs] = useState<FilePair[]>([]);
  const [phase, setPhase] = useState<FolderPhase>('idle');
  const [progress, setProgress] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const collectWarnings = useCallback(() => {
    const out: string[] = [];
    for (const side of SIDES) {
      const scan = scansRef.current[side];
      if (!scan) continue;
      if (scan.result.truncated) {
        out.push(
          `${sideLabel(side)}目录文件数超过 ${MAX_SCAN_FILES}，只对比了先扫到的 ${scan.result.files.length} 个。`,
        );
      }
      if (scan.result.ignoreSource === 'default') {
        out.push(`${sideLabel(side)}目录没有 .gitignore，已按内置规则跳过依赖与构建产物目录。`);
      }
    }
    setWarnings(out);
  }, []);

  const scanSide = useCallback(async (side: Side, handle: FileSystemDirectoryHandle) => {
    setPhase('scanning');
    setProgress(`扫描${sideLabel(side)}目录…`);
    const result = await scanDirectory(handle, (count) => {
      setProgress(`扫描${sideLabel(side)}目录…已发现 ${count} 个文件`);
    });
    scansRef.current[side] = { handle, name: handle.name, result };
    setNames((prev) => ({ ...prev, [side]: handle.name }));
  }, []);

  const runCompare = useCallback(async () => {
    const left = scansRef.current.left;
    const right = scansRef.current.right;
    if (!left || !right) return;

    seqRef.current += 1;
    const seq = seqRef.current;

    // 先按大小配对并立刻上屏，用户能马上看到清单，内容比对再补状态
    const initial = pairFiles(left.result.files, right.result.files);
    setPairs(initial);
    setPhase('comparing');

    const pending: PendingCompare[] = [];
    for (const pair of initial) {
      if (pair.status !== 'unknown') continue;
      const leftHandle = left.result.handles.get(pair.path);
      const rightHandle = right.result.handles.get(pair.path);
      if (leftHandle && rightHandle) {
        pending.push({ path: pair.path, left: leftHandle, right: rightHandle });
      }
    }

    if (pending.length === 0) {
      setPhase('ready');
      setProgress(null);
      return;
    }

    setProgress(`比对内容 0/${pending.length}`);
    const resolutions = await compareContents(pending, (done, total) => {
      if (seq === seqRef.current) setProgress(`比对内容 ${done}/${total}`);
    });

    // 期间又选了别的目录，这一轮结果作废
    if (seq !== seqRef.current) return;

    setPairs(resolvePairStatuses(initial, resolutions));
    setPhase('ready');
    setProgress(null);
  }, []);

  const pick = useCallback(
    async (side: Side) => {
      try {
        const handle = await pickDirectory();
        if (!handle) return;
        await scanSide(side, handle);
        collectWarnings();
        if (scansRef.current.left && scansRef.current.right) {
          await runCompare();
        } else {
          // 只选了一侧，等另一侧
          setPhase('idle');
          setProgress(null);
        }
      } catch (err) {
        setPhase('idle');
        setProgress(null);
        onError(err instanceof Error ? err.message : '打开文件夹失败');
      }
    },
    [scanSide, collectWarnings, runCompare, onError],
  );

  const rescan = useCallback(async () => {
    const { left, right } = scansRef.current;
    if (!left || !right) return;
    try {
      await scanSide('left', left.handle);
      await scanSide('right', right.handle);
      collectWarnings();
      await runCompare();
    } catch (err) {
      setPhase('idle');
      setProgress(null);
      onError(err instanceof Error ? err.message : '重新扫描失败');
    }
  }, [scanSide, collectWarnings, runCompare, onError]);

  const reset = useCallback(() => {
    // 顺带让进行中的比对结果失效
    seqRef.current += 1;
    scansRef.current = { left: null, right: null };
    setNames({ left: null, right: null });
    setPairs([]);
    setPhase('idle');
    setProgress(null);
    setWarnings([]);
  }, []);

  const handlesFor = useCallback(
    (path: string) => ({
      left: scansRef.current.left?.result.handles.get(path) ?? null,
      right: scansRef.current.right?.result.handles.get(path) ?? null,
    }),
    [],
  );

  const ready = names.left !== null && names.right !== null;

  return {
    supported,
    names,
    pairs,
    phase,
    progress,
    warnings,
    ready,
    pick,
    rescan,
    reset,
    handlesFor,
  };
}
