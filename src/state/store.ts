/**
 * 应用状态：文档、对比选项、历史、导航位置与文件句柄。
 *
 * 差异结果不放在这里。文档是唯一真源，差异由文档派生，
 * 在 Worker 中异步计算后单独持有，避免两份状态不一致。
 */

import { DEFAULT_TEXT_META, type TextMeta } from '../core/text';
import { applyBlockOperation, applyBlockOperations, operationLabel } from '../core/operations';
import {
  DEFAULT_COMPARE_OPTIONS,
  DEFAULT_KEEP_BOTH_CONFIG,
  type BlockOperation,
  type CompareOptions,
  type DiffBlock,
  type KeepBothConfig,
  type Side,
} from '../core/types';
import {
  canRedo,
  canUndo,
  createHistory,
  currentEntry,
  pushHistory,
  redo,
  undo,
  type HistoryState,
} from './history';

/** 单侧文档状态。 */
export interface DocumentState {
  lines: string[];
  meta: TextMeta;
  /** 显示用文件名。 */
  name: string;
  /** 自上次保存以来是否有改动。 */
  dirty: boolean;
  /** 是否已绑定可写回的文件句柄。句柄本身不放进 state，见 fileHandles。 */
  hasHandle: boolean;
}

export interface AppState {
  left: DocumentState;
  right: DocumentState;
  options: CompareOptions;
  keepBoth: KeepBothConfig;
  history: HistoryState;
  /** 当前定位到第几个差异，-1 表示未定位。 */
  activeDiff: number;
  /** 未变更区域保留的上下文行数；null 表示全部展开。 */
  contextLines: number | null;
}

function emptyDoc(name: string): DocumentState {
  return { lines: [], meta: { ...DEFAULT_TEXT_META }, name, dirty: false, hasHandle: false };
}

export function createInitialState(): AppState {
  const left = emptyDoc('左侧文档');
  const right = emptyDoc('右侧文档');
  return {
    left,
    right,
    options: { ...DEFAULT_COMPARE_OPTIONS },
    keepBoth: { ...DEFAULT_KEEP_BOTH_CONFIG },
    history: createHistory({
      left: { lines: left.lines, meta: left.meta },
      right: { lines: right.lines, meta: right.meta },
      label: '初始状态',
      mergeKey: null,
      at: Date.now(),
    }),
    activeDiff: -1,
    contextLines: 3,
  };
}

export type Action =
  | { type: 'loadDocument'; side: Side; lines: string[]; meta: TextMeta; name: string; hasHandle: boolean }
  | { type: 'replaceLines'; side: Side; lines: string[]; mergeKey: string | null; label: string }
  | { type: 'applyOperation'; block: DiffBlock; operation: BlockOperation }
  | { type: 'applyAllOperations'; blocks: DiffBlock[]; operation: BlockOperation }
  | { type: 'setOptions'; options: Partial<CompareOptions> }
  | { type: 'setKeepBoth'; config: Partial<KeepBothConfig> }
  | { type: 'setContextLines'; value: number | null }
  | { type: 'setActiveDiff'; index: number }
  | { type: 'markSaved'; side: Side }
  | { type: 'attachHandle'; side: Side; name: string }
  | { type: 'swapSides' }
  | { type: 'undo' }
  | { type: 'redo' };

/** 把当前文档状态写入历史。 */
function record(state: AppState, label: string, mergeKey: string | null): HistoryState {
  return pushHistory(state.history, {
    left: { lines: state.left.lines, meta: state.left.meta },
    right: { lines: state.right.lines, meta: state.right.meta },
    label,
    mergeKey,
    at: Date.now(),
  });
}

/** 从历史条目恢复文档内容，保留文件名与句柄等非历史字段。 */
function restore(state: AppState, history: HistoryState): AppState {
  const entry = currentEntry(history);
  return {
    ...state,
    history,
    left: { ...state.left, lines: entry.left.lines, meta: entry.left.meta, dirty: true },
    right: { ...state.right, lines: entry.right.lines, meta: entry.right.meta, dirty: true },
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'loadDocument': {
      const next: AppState = {
        ...state,
        [action.side]: {
          lines: action.lines,
          meta: action.meta,
          name: action.name,
          dirty: false,
          hasHandle: action.hasHandle,
        },
        activeDiff: -1,
      };
      return { ...next, history: record(next, `载入 ${action.name}`, null) };
    }

    case 'replaceLines': {
      const next: AppState = {
        ...state,
        [action.side]: { ...state[action.side], lines: action.lines, dirty: true },
      };
      return { ...next, history: record(next, action.label, action.mergeKey) };
    }

    case 'applyOperation': {
      const result = applyBlockOperation(
        action.block,
        state.left.lines,
        state.right.lines,
        action.operation,
        state.keepBoth,
      );
      const next: AppState = {
        ...state,
        left: { ...state.left, lines: result.left, dirty: true },
        right: { ...state.right, lines: result.right, dirty: true },
      };
      const label = operationLabel(action.block.kind, action.operation);
      return { ...next, history: record(next, label, null) };
    }

    case 'applyAllOperations': {
      const result = applyBlockOperations(
        action.blocks,
        state.left.lines,
        state.right.lines,
        action.operation,
        state.keepBoth,
      );
      const next: AppState = {
        ...state,
        left: { ...state.left, lines: result.left, dirty: true },
        right: { ...state.right, lines: result.right, dirty: true },
        activeDiff: -1,
      };
      const label = `全部${operationLabel('conflict', action.operation)}`;
      return { ...next, history: record(next, label, null) };
    }

    case 'setOptions':
      return { ...state, options: { ...state.options, ...action.options }, activeDiff: -1 };

    case 'setKeepBoth':
      return { ...state, keepBoth: { ...state.keepBoth, ...action.config } };

    case 'setContextLines':
      return { ...state, contextLines: action.value };

    case 'setActiveDiff':
      return { ...state, activeDiff: action.index };

    case 'markSaved':
      return { ...state, [action.side]: { ...state[action.side], dirty: false } };

    case 'attachHandle':
      return {
        ...state,
        [action.side]: { ...state[action.side], hasHandle: true, name: action.name },
      };

    case 'swapSides': {
      const next: AppState = { ...state, left: state.right, right: state.left, activeDiff: -1 };
      return { ...next, history: record(next, '交换两侧', null) };
    }

    case 'undo':
      return canUndo(state.history) ? restore(state, undo(state.history)) : state;

    case 'redo':
      return canRedo(state.history) ? restore(state, redo(state.history)) : state;
  }
}

/** 是否存在未保存改动。 */
export function hasUnsavedChanges(state: AppState): boolean {
  return state.left.dirty || state.right.dirty;
}
