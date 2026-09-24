/**
 * 撤销栈：块级操作与手动编辑共用同一条历史。
 *
 * 设计取舍：直接保存行数组快照，而非反向补丁。
 * 理由是块操作与手动编辑的反向补丁形式不统一，快照实现简单且不易出错；
 * 代价是内存占用，通过 limit 上限与「相邻文本编辑合并」两个手段控制。
 */

import type { TextMeta } from '../core/text';

/** 一次历史记录中的文档快照。 */
export interface DocumentSnapshot {
  lines: string[];
  meta: TextMeta;
}

/** 一次历史记录：两侧文档的完整状态。 */
export interface HistoryEntry {
  left: DocumentSnapshot;
  right: DocumentSnapshot;
  /** 供 UI 展示的操作说明。 */
  label: string;
  /** 合并键：相邻且键相同的文本编辑会被合并为一步。 */
  mergeKey: string | null;
  at: number;
}

export interface HistoryState {
  entries: HistoryEntry[];
  /** 当前所处的历史位置。 */
  cursor: number;
  limit: number;
}

export const DEFAULT_HISTORY_LIMIT = 200;

export function createHistory(initial: HistoryEntry, limit = DEFAULT_HISTORY_LIMIT): HistoryState {
  return { entries: [initial], cursor: 0, limit };
}

export function canUndo(state: HistoryState): boolean {
  return state.cursor > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.cursor < state.entries.length - 1;
}

export function currentEntry(state: HistoryState): HistoryEntry {
  return state.entries[state.cursor];
}

/**
 * 压入一条新历史。
 *
 * - 若当前不在栈顶（用户撤销过），则丢弃后续分支，与主流编辑器行为一致
 * - 若 mergeKey 与栈顶相同且均非 null，则替换栈顶，实现连续输入合并为一步
 * - 超过 limit 时从最旧一端裁剪
 */
export function pushHistory(state: HistoryState, entry: HistoryEntry): HistoryState {
  const kept = state.entries.slice(0, state.cursor + 1);
  const top = kept[kept.length - 1];

  if (entry.mergeKey !== null && top && top.mergeKey === entry.mergeKey) {
    const merged = [...kept.slice(0, -1), entry];
    return { ...state, entries: merged, cursor: merged.length - 1 };
  }

  const appended = [...kept, entry];
  if (appended.length > state.limit) {
    const overflow = appended.length - state.limit;
    const trimmed = appended.slice(overflow);
    return { ...state, entries: trimmed, cursor: trimmed.length - 1 };
  }

  return { ...state, entries: appended, cursor: appended.length - 1 };
}

export function undo(state: HistoryState): HistoryState {
  if (!canUndo(state)) return state;
  return { ...state, cursor: state.cursor - 1 };
}

export function redo(state: HistoryState): HistoryState {
  if (!canRedo(state)) return state;
  return { ...state, cursor: state.cursor + 1 };
}

/** 供 UI 展示的下一步撤销/重做说明。 */
export function undoLabel(state: HistoryState): string | null {
  if (!canUndo(state)) return null;
  return state.entries[state.cursor].label;
}

export function redoLabel(state: HistoryState): string | null {
  if (!canRedo(state)) return null;
  return state.entries[state.cursor + 1].label;
}
