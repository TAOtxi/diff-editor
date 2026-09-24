import { describe, expect, it } from 'vitest';
import { DEFAULT_TEXT_META } from '../core/text';
import {
  canRedo,
  canUndo,
  createHistory,
  currentEntry,
  pushHistory,
  redo,
  redoLabel,
  undo,
  undoLabel,
  type HistoryEntry,
} from './history';

function entry(left: string[], right: string[], label = 'op', mergeKey: string | null = null): HistoryEntry {
  return {
    left: { lines: left, meta: DEFAULT_TEXT_META },
    right: { lines: right, meta: DEFAULT_TEXT_META },
    label,
    mergeKey,
    at: 0,
  };
}

describe('history 基础行为', () => {
  it('初始状态不能撤销也不能重做', () => {
    const h = createHistory(entry(['a'], ['b'], '初始'));
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('压入后可撤销', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['b'], ['b'], '改动'));
    expect(canUndo(h)).toBe(true);
    expect(currentEntry(h).left.lines).toEqual(['b']);
  });

  it('撤销回到上一状态', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['b'], ['b'], '改动'));
    h = undo(h);
    expect(currentEntry(h).left.lines).toEqual(['a']);
    expect(canRedo(h)).toBe(true);
  });

  it('重做回到撤销前状态', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['b'], ['b'], '改动'));
    h = redo(undo(h));
    expect(currentEntry(h).left.lines).toEqual(['b']);
  });

  it('撤销到底后再撤销无副作用', () => {
    let h = createHistory(entry(['a'], ['a']));
    h = undo(undo(h));
    expect(currentEntry(h).left.lines).toEqual(['a']);
    expect(canUndo(h)).toBe(false);
  });

  it('重做到顶后再重做无副作用', () => {
    let h = createHistory(entry(['a'], ['a']));
    h = pushHistory(h, entry(['b'], ['b']));
    h = redo(redo(h));
    expect(currentEntry(h).left.lines).toEqual(['b']);
  });

  it('撤销后压入新记录会丢弃重做分支', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['b'], ['b'], '第二步'));
    h = undo(h);
    h = pushHistory(h, entry(['c'], ['c'], '新分支'));
    expect(canRedo(h)).toBe(false);
    expect(currentEntry(h).left.lines).toEqual(['c']);
    expect(h.entries).toHaveLength(2);
  });

  it('连续多步撤销重做保持顺序', () => {
    let h = createHistory(entry(['0'], ['0']));
    for (let i = 1; i <= 5; i += 1) {
      h = pushHistory(h, entry([String(i)], [String(i)]));
    }
    for (let i = 0; i < 5; i += 1) h = undo(h);
    expect(currentEntry(h).left.lines).toEqual(['0']);
    for (let i = 0; i < 5; i += 1) h = redo(h);
    expect(currentEntry(h).left.lines).toEqual(['5']);
  });
});

describe('history 合并与上限', () => {
  it('相同 mergeKey 的相邻记录合并为一步', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['ab'], ['a'], '输入', 'edit-left'));
    h = pushHistory(h, entry(['abc'], ['a'], '输入', 'edit-left'));
    expect(h.entries).toHaveLength(2);
    h = undo(h);
    expect(currentEntry(h).left.lines).toEqual(['a']);
  });

  it('不同 mergeKey 不合并', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['ab'], ['a'], '输入', 'edit-left'));
    h = pushHistory(h, entry(['ab'], ['ax'], '输入', 'edit-right'));
    expect(h.entries).toHaveLength(3);
  });

  it('mergeKey 为 null 时不合并', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['b'], ['b'], '块操作', null));
    h = pushHistory(h, entry(['c'], ['c'], '块操作', null));
    expect(h.entries).toHaveLength(3);
  });

  it('块操作打断文本编辑的合并', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['ab'], ['a'], '输入', 'edit-left'));
    h = pushHistory(h, entry(['x'], ['x'], '采用左侧', null));
    h = pushHistory(h, entry(['xy'], ['x'], '输入', 'edit-left'));
    expect(h.entries).toHaveLength(4);
  });

  it('超过上限时裁剪最旧记录', () => {
    let h = createHistory(entry(['0'], ['0']), 3);
    h = pushHistory(h, entry(['1'], ['1']));
    h = pushHistory(h, entry(['2'], ['2']));
    h = pushHistory(h, entry(['3'], ['3']));
    expect(h.entries).toHaveLength(3);
    expect(h.entries[0].left.lines).toEqual(['1']);
    expect(currentEntry(h).left.lines).toEqual(['3']);
  });
});

describe('history 标签', () => {
  it('无可撤销项时标签为 null', () => {
    const h = createHistory(entry(['a'], ['a'], '初始'));
    expect(undoLabel(h)).toBeNull();
    expect(redoLabel(h)).toBeNull();
  });

  it('撤销标签指向当前步的说明', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['b'], ['b'], '采用左侧'));
    expect(undoLabel(h)).toBe('采用左侧');
  });

  it('重做标签指向下一步的说明', () => {
    let h = createHistory(entry(['a'], ['a'], '初始'));
    h = pushHistory(h, entry(['b'], ['b'], '采用左侧'));
    h = undo(h);
    expect(redoLabel(h)).toBe('采用左侧');
  });
});
