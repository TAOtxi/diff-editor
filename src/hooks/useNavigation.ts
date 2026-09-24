/**
 * 差异导航：上一个/下一个、首个/末个、回绕与位置保持。
 *
 * 关键行为：执行块操作后差异重算，changedIndexes 会变化。
 * 此时不应跳回顶部，而应停在「原位置附近的下一个未解决差异」，
 * 由 clampToNearest 负责把旧位置映射到新列表上。
 */

import { useCallback, useEffect, useRef } from 'react';

export interface NavigationApi {
  /** 当前差异在 changedIndexes 中的序号，从 0 开始；-1 表示未定位。 */
  position: number;
  /** 差异总数。 */
  total: number;
  goNext: () => void;
  goPrev: () => void;
  goFirst: () => void;
  goLast: () => void;
  goTo: (position: number) => void;
}

export interface UseNavigationParams {
  changedIndexes: readonly number[];
  /** 当前激活的块序号（store 中的 activeDiff）。 */
  activeBlock: number;
  /** 设置激活块序号。 */
  setActiveBlock: (blockIndex: number) => void;
  /** 是否到头回绕。 */
  wrap: boolean;
}

export function useNavigation({
  changedIndexes,
  activeBlock,
  setActiveBlock,
  wrap,
}: UseNavigationParams): NavigationApi {
  const total = changedIndexes.length;
  const position = changedIndexes.indexOf(activeBlock);

  // 记录上一次的激活块，用于差异重算后的位置保持
  const lastActiveRef = useRef(activeBlock);
  useEffect(() => {
    if (activeBlock >= 0) lastActiveRef.current = activeBlock;
  }, [activeBlock]);

  // 差异列表变化后，若当前激活块已不存在（差异被消解），就近定位
  useEffect(() => {
    if (total === 0) {
      if (activeBlock !== -1) setActiveBlock(-1);
      return;
    }
    if (activeBlock === -1) return;
    if (changedIndexes.includes(activeBlock)) return;

    const nearest = clampToNearest(changedIndexes, lastActiveRef.current);
    setActiveBlock(nearest);
  }, [changedIndexes, total, activeBlock, setActiveBlock]);

  const goTo = useCallback(
    (target: number) => {
      if (total === 0) return;
      let next = target;
      if (wrap) {
        next = ((target % total) + total) % total;
      } else {
        next = Math.max(0, Math.min(total - 1, target));
      }
      setActiveBlock(changedIndexes[next]);
    },
    [changedIndexes, total, wrap, setActiveBlock],
  );

  const goNext = useCallback(() => {
    if (total === 0) return;
    // 未定位时从第一个开始
    if (position === -1) {
      setActiveBlock(changedIndexes[0]);
      return;
    }
    goTo(position + 1);
  }, [position, total, changedIndexes, goTo, setActiveBlock]);

  const goPrev = useCallback(() => {
    if (total === 0) return;
    if (position === -1) {
      setActiveBlock(changedIndexes[total - 1]);
      return;
    }
    goTo(position - 1);
  }, [position, total, changedIndexes, goTo, setActiveBlock]);

  const goFirst = useCallback(() => goTo(0), [goTo]);
  const goLast = useCallback(() => goTo(total - 1), [goTo, total]);

  return { position, total, goNext, goPrev, goFirst, goLast, goTo };
}

/**
 * 把一个可能已失效的块序号映射到当前差异列表中最近的一个。
 *
 * 优先取「序号大于等于原值」的第一个，即视觉上的下一个未解决差异；
 * 没有则取最后一个。
 */
export function clampToNearest(changedIndexes: readonly number[], previous: number): number {
  if (changedIndexes.length === 0) return -1;
  for (const idx of changedIndexes) {
    if (idx >= previous) return idx;
  }
  return changedIndexes[changedIndexes.length - 1];
}
