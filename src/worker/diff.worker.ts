/// <reference lib="webworker" />

/**
 * 差异计算 Worker。
 *
 * 把 diff 放到 Worker 里，保证大文件计算不阻塞输入与滚动。
 * 每个请求带 seq，主线程据此丢弃过期结果。
 */

import { computeDiff } from '../core/diff';
import type { CompareOptions, DiffResult } from '../core/types';

export interface DiffRequest {
  seq: number;
  left: string[];
  right: string[];
  options: CompareOptions;
}

export interface DiffResponse {
  seq: number;
  result: DiffResult;
  /** 计算耗时，毫秒。用于 UI 显示与性能排查。 */
  elapsed: number;
}

self.onmessage = (event: MessageEvent<DiffRequest>) => {
  const { seq, left, right, options } = event.data;
  const started = performance.now();
  const result = computeDiff(left, right, options);
  const response: DiffResponse = {
    seq,
    result,
    elapsed: performance.now() - started,
  };
  (self as unknown as Worker).postMessage(response);
};
