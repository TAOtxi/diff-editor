/**
 * 差异计算 Hook：在 Worker 中计算，主线程只消费结果。
 *
 * 过期结果处理：每次请求带自增 seq，只接受 seq 等于最新请求的响应，
 * 避免慢的旧请求覆盖新结果。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { computeDiff } from '../core/diff';
import type { CompareOptions, DiffResult } from '../core/types';
import type { DiffRequest, DiffResponse } from '../worker/diff.worker';

const EMPTY_RESULT: DiffResult = {
  blocks: [],
  changedIndexes: [],
  stats: {
    changedBlocks: 0,
    deleteBlocks: 0,
    insertBlocks: 0,
    conflictBlocks: 0,
    leftChangedLines: 0,
    rightChangedLines: 0,
  },
};

/** 输入防抖时长，毫秒。手动输入时避免每次按键都触发全量 diff。 */
const DEBOUNCE_MS = 250;

export interface UseDiffResult {
  result: DiffResult;
  computing: boolean;
  elapsed: number;
}

export function useDiff(
  leftLines: string[],
  rightLines: string[],
  options: CompareOptions,
): UseDiffResult {
  const [state, setState] = useState<{ result: DiffResult; elapsed: number }>({
    result: EMPTY_RESULT,
    elapsed: 0,
  });
  const [computing, setComputing] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);
  const acceptedRef = useRef(0);

  // Worker 只创建一次，卸载时终止
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../worker/diff.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      // 测试环境或不支持 Worker 时留空，下方回退到同步计算
      worker = null;
    }
    workerRef.current = worker;

    if (worker) {
      worker.onmessage = (event: MessageEvent<DiffResponse>) => {
        const { seq, result, elapsed } = event.data;
        // 丢弃过期响应
        if (seq < acceptedRef.current) return;
        acceptedRef.current = seq;
        setState({ result, elapsed });
        if (seq === seqRef.current) setComputing(false);
      };
      worker.onerror = () => {
        setComputing(false);
      };
    }

    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    seqRef.current += 1;
    const seq = seqRef.current;

    // 无内容时直接给空结果，省掉一次往返
    if (leftLines.length === 0 && rightLines.length === 0) {
      acceptedRef.current = seq;
      setState({ result: EMPTY_RESULT, elapsed: 0 });
      setComputing(false);
      return;
    }

    setComputing(true);

    if (!worker) {
      // 回退路径：同步计算。测试环境走这里
      const started = performance.now();
      const result = computeDiff(leftLines, rightLines, options);
      acceptedRef.current = seq;
      setState({ result, elapsed: performance.now() - started });
      setComputing(false);
      return;
    }

    const timer = setTimeout(() => {
      const request: DiffRequest = { seq, left: leftLines, right: rightLines, options };
      worker.postMessage(request);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [leftLines, rightLines, options]);

  return useMemo(
    () => ({ result: state.result, computing, elapsed: state.elapsed }),
    [state.result, state.elapsed, computing],
  );
}
