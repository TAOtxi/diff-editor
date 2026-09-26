import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DiffView } from './components/DiffView';
import { FileHeader } from './components/FileHeader';
import { OptionsPanel } from './components/OptionsPanel';
import { TextDialog } from './components/TextDialog';
import { Toolbar } from './components/Toolbar';
import { joinLines, splitLines } from './core/text';
import type { BlockOperation, DiffBlock, Side } from './core/types';
import {
  FileLoadWarning,
  isFileSystemAccessSupported,
  pickFile,
  readFile,
  saveAs,
  writeToHandle,
} from './fs/fileAccess';
import { useDiff } from './hooks/useDiff';
import { useNavigation } from './hooks/useNavigation';
import { useHighlight, type HighlightMode } from './hooks/useHighlight';
import { canRedo, canUndo } from './state/history';
import { createInitialState, hasUnsavedChanges, reducer } from './state/store';
import { buildRows, findRowForBlock } from './view/rows';
import './App.css';

type DialogState =
  | { kind: 'paste'; side: Side }
  | { kind: 'editAll'; side: Side }
  | null;

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scrollToRow, setScrollToRow] = useState<number | null>(null);
  /** 语法高亮模式：auto 跟随文件名推断，off 关闭。 */
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('auto');
  /** 被用户手动展开的 equal 块，不再折叠。 */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // 文件句柄不放进 reducer state：它不可序列化，也不该进撤销历史
  const handlesRef = useRef<Record<Side, FileSystemFileHandle | null>>({
    left: null,
    right: null,
  });

  const supported = useMemo(() => isFileSystemAccessSupported(), []);
  const { result, computing } = useDiff(state.left.lines, state.right.lines, state.options);

  const leftHighlight = useHighlight(state.left.lines, state.left.name, highlightMode);
  const rightHighlight = useHighlight(state.right.lines, state.right.name, highlightMode);

  const displayRows = useMemo(
    () =>
      buildRows({
        blocks: result.blocks,
        leftLines: state.left.lines,
        rightLines: state.right.lines,
        contextLines: state.contextLines,
        expandedBlocks: expanded,
      }),
    [result.blocks, state.left.lines, state.right.lines, state.contextLines, expanded],
  );

  const setActiveBlock = useCallback(
    (index: number) => dispatch({ type: 'setActiveDiff', index }),
    [],
  );

  const nav = useNavigation({
    changedIndexes: result.changedIndexes,
    activeBlock: state.activeDiff,
    setActiveBlock,
    wrap: true,
  });

  // 激活块变化时滚动定位
  useEffect(() => {
    if (state.activeDiff < 0) return;
    const rowIndex = findRowForBlock(displayRows, state.activeDiff);
    if (rowIndex >= 0) setScrollToRow(rowIndex);
  }, [state.activeDiff, displayRows]);

  const notify = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 4000);
  }, []);

  const loadFile = useCallback(
    async (side: Side, file: File, handle: FileSystemFileHandle | null, force = false) => {
      try {
        const loaded = await readFile(file, handle, force);
        handlesRef.current[side] = loaded.handle;
        dispatch({
          type: 'loadDocument',
          side,
          lines: loaded.lines,
          meta: loaded.meta,
          name: loaded.name,
          hasHandle: loaded.handle !== null,
        });
        setExpanded(new Set());
      } catch (err) {
        if (err instanceof FileLoadWarning) {
          if (window.confirm(`${err.message}\n\n仍要继续打开吗？`)) {
            await loadFile(side, file, handle, true);
          }
          return;
        }
        notify(err instanceof Error ? err.message : '打开文件失败');
      }
    },
    [notify],
  );

  const handlePick = useCallback(
    async (side: Side) => {
      try {
        const picked = await pickFile();
        if (!picked) return;
        await loadFile(side, picked.file, picked.handle);
      } catch (err) {
        notify(err instanceof Error ? err.message : '打开文件失败');
      }
    },
    [loadFile, notify],
  );

  const handleSave = useCallback(
    async (side: Side) => {
      const handle = handlesRef.current[side];
      const doc = state[side];
      const content = joinLines(doc.lines, doc.meta);
      try {
        if (!handle) {
          const newHandle = await saveAs(doc.name, content);
          if (!newHandle) return;
          handlesRef.current[side] = newHandle;
          dispatch({ type: 'attachHandle', side, name: newHandle.name });
          dispatch({ type: 'markSaved', side });
          notify(`已保存 ${newHandle.name}`);
          return;
        }
        await writeToHandle(handle, content);
        dispatch({ type: 'markSaved', side });
        notify(`已保存 ${doc.name}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : '保存失败');
      }
    },
    [state, notify],
  );

  const handleSaveAs = useCallback(
    async (side: Side) => {
      const doc = state[side];
      try {
        const handle = await saveAs(doc.name, joinLines(doc.lines, doc.meta));
        if (!handle) return;
        handlesRef.current[side] = handle;
        dispatch({ type: 'attachHandle', side, name: handle.name });
        dispatch({ type: 'markSaved', side });
        notify(`已另存为 ${handle.name}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : '另存为失败');
      }
    },
    [state, notify],
  );

  const handleApply = useCallback((block: DiffBlock, operation: BlockOperation) => {
    dispatch({ type: 'applyOperation', block, operation });
  }, []);

  const handleEditLine = useCallback(
    (side: Side, lineNumber: number, value: string) => {
      const lines = [...state[side].lines];
      lines[lineNumber] = value;
      dispatch({
        type: 'replaceLines',
        side,
        lines,
        mergeKey: `edit-${side}-${lineNumber}`,
        label: `编辑${side === 'left' ? '左' : '右'}侧第 ${lineNumber + 1} 行`,
      });
    },
    [state],
  );

  const handleDialogConfirm = useCallback(
    (value: string) => {
      if (!dialog) return;
      const { lines, meta } = splitLines(value);
      if (dialog.kind === 'paste') {
        dispatch({
          type: 'loadDocument',
          side: dialog.side,
          lines,
          meta,
          name: dialog.side === 'left' ? '粘贴内容（左）' : '粘贴内容（右）',
          hasHandle: handlesRef.current[dialog.side] !== null,
        });
      } else {
        dispatch({
          type: 'replaceLines',
          side: dialog.side,
          lines,
          mergeKey: null,
          label: `整篇编辑${dialog.side === 'left' ? '左' : '右'}侧`,
        });
      }
      setDialog(null);
      setExpanded(new Set());
    },
    [dialog],
  );

  // 全局快捷键
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave('left');
        void handleSave('right');
        return;
      }
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        nav.goNext();
        return;
      }
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        nav.goPrev();
        return;
      }
      if (e.altKey && e.key === 'Home') {
        e.preventDefault();
        nav.goFirst();
        return;
      }
      if (e.altKey && e.key === 'End') {
        e.preventDefault();
        nav.goLast();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nav, handleSave]);

  // 未保存改动离开提示
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges(state)) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state]);

  return (
    <div className="app">
      {!supported && (
        <div className="banner banner-error">
          当前浏览器不支持 File System Access API，无法直接读写本地文件。请使用 Chrome 打开本页面。
        </div>
      )}

      <Toolbar
        stats={result.stats}
        position={nav.position}
        total={nav.total}
        computing={computing}
        canUndo={canUndo(state.history)}
        canRedo={canRedo(state.history)}
        optionsOpen={optionsOpen}
        onPrev={nav.goPrev}
        onNext={nav.goNext}
        onFirst={nav.goFirst}
        onLast={nav.goLast}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onToggleOptions={() => setOptionsOpen((v) => !v)}
        onSwap={() => dispatch({ type: 'swapSides' })}
        onTakeAllLeft={() => {
          if (window.confirm('确定把所有差异都改为左侧内容吗？此操作可撤销。')) {
            dispatch({ type: 'applyAllOperations', blocks: result.blocks, operation: 'takeLeft' });
          }
        }}
        onTakeAllRight={() => {
          if (window.confirm('确定把所有差异都改为右侧内容吗？此操作可撤销。')) {
            dispatch({ type: 'applyAllOperations', blocks: result.blocks, operation: 'takeRight' });
          }
        }}
      />

      <div className="headers">
        <FileHeader
          side="left"
          doc={state.left}
          supported={supported}
          onPick={handlePick}
          onDropFile={(side, file) => void loadFile(side, file, null)}
          onPasteText={(side) => setDialog({ kind: 'paste', side })}
          onSave={(side) => void handleSave(side)}
          onSaveAs={(side) => void handleSaveAs(side)}
          onEditAll={(side) => setDialog({ kind: 'editAll', side })}
        />
        <FileHeader
          side="right"
          doc={state.right}
          supported={supported}
          onPick={handlePick}
          onDropFile={(side, file) => void loadFile(side, file, null)}
          onPasteText={(side) => setDialog({ kind: 'paste', side })}
          onSave={(side) => void handleSave(side)}
          onSaveAs={(side) => void handleSaveAs(side)}
          onEditAll={(side) => setDialog({ kind: 'editAll', side })}
        />
      </div>

      {optionsOpen && (
        <OptionsPanel
          options={state.options}
          keepBoth={state.keepBoth}
          contextLines={state.contextLines}
          highlightMode={highlightMode}
          onOptions={(options) => dispatch({ type: 'setOptions', options })}
          onKeepBoth={(config) => dispatch({ type: 'setKeepBoth', config })}
          onContextLines={(value) => dispatch({ type: 'setContextLines', value })}
          onHighlightMode={setHighlightMode}
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {displayRows.length === 0 ? (
        <div className="empty-state">
          <p>打开两个文件开始对比。</p>
          <p className="empty-hint">
            支持点击「打开」选择文件、把文件拖到标题栏，或用「粘贴」直接贴入文本。
          </p>
        </div>
      ) : (
        <>
          {result.stats.changedBlocks === 0 && (
            <div className="banner banner-ok">两份内容完全一致，没有差异。</div>
          )}
          <DiffView
            rows={displayRows}
            blocks={result.blocks}
            leftLines={state.left.lines}
            rightLines={state.right.lines}
            activeBlock={state.activeDiff}
            onApply={handleApply}
            onEditLine={handleEditLine}
            onExpand={(blockIndex) =>
              setExpanded((prev) => new Set(prev).add(blockIndex))
            }
            scrollToRow={scrollToRow}
            leftHighlight={leftHighlight.active ? leftHighlight.lines : undefined}
            rightHighlight={rightHighlight.active ? rightHighlight.lines : undefined}
            leftLanguage={leftHighlight.active ? leftHighlight.language : undefined}
            rightLanguage={rightHighlight.active ? rightHighlight.language : undefined}
          />
        </>
      )}

      {dialog && (
        <TextDialog
          title={
            dialog.kind === 'paste'
              ? `粘贴到${dialog.side === 'left' ? '左' : '右'}侧`
              : `编辑${dialog.side === 'left' ? '左' : '右'}侧全文`
          }
          initialValue={
            dialog.kind === 'paste' ? '' : joinLines(state[dialog.side].lines, state[dialog.side].meta)
          }
          confirmLabel={dialog.kind === 'paste' ? '载入' : '应用'}
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialog(null)}
        />
      )}

      {message && <div className="toast">{message}</div>}
    </div>
  );
}
