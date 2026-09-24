import type { CompareOptions, KeepBothConfig } from '../core/types';

interface OptionsPanelProps {
  options: CompareOptions;
  keepBoth: KeepBothConfig;
  contextLines: number | null;
  onOptions: (patch: Partial<CompareOptions>) => void;
  onKeepBoth: (patch: Partial<KeepBothConfig>) => void;
  onContextLines: (value: number | null) => void;
  onClose: () => void;
}

export function OptionsPanel({
  options,
  keepBoth,
  contextLines,
  onOptions,
  onKeepBoth,
  onContextLines,
  onClose,
}: OptionsPanelProps) {
  return (
    <div className="options-panel" role="dialog" aria-label="对比选项">
      <div className="options-header">
        <span>对比选项</span>
        <button type="button" className="ghost-btn" onClick={onClose} aria-label="关闭选项面板">
          ✕
        </button>
      </div>

      <fieldset>
        <legend>差异判定</legend>
        <label>
          <input
            type="checkbox"
            checked={options.ignoreTrailingWhitespace}
            onChange={(e) => onOptions({ ignoreTrailingWhitespace: e.target.checked })}
          />
          忽略行尾空白
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.ignoreAllWhitespace}
            onChange={(e) => onOptions({ ignoreAllWhitespace: e.target.checked })}
          />
          忽略全部空白
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.ignoreCase}
            onChange={(e) => onOptions({ ignoreCase: e.target.checked })}
          />
          忽略大小写
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.ignoreBlankLines}
            onChange={(e) => onOptions({ ignoreBlankLines: e.target.checked })}
          />
          忽略空行
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.normalizeEol}
            onChange={(e) => onOptions({ normalizeEol: e.target.checked })}
          />
          行尾符归一化（CRLF 视同 LF）
        </label>
        <label className="inline-field">
          制表符宽度
          <select
            value={options.tabWidth}
            onChange={(e) => onOptions({ tabWidth: Number(e.target.value) })}
          >
            <option value={0}>不展开</option>
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>保留两者</legend>
        <label className="inline-field">
          拼接顺序
          <select
            value={keepBoth.order}
            onChange={(e) => onKeepBoth({ order: e.target.value as KeepBothConfig['order'] })}
          >
            <option value="leftFirst">左侧在前</option>
            <option value="rightFirst">右侧在前</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={keepBoth.insertMarkers}
            onChange={(e) => onKeepBoth({ insertMarkers: e.target.checked })}
          />
          插入 git 风格冲突标记
        </label>
      </fieldset>

      <fieldset>
        <legend>显示</legend>
        <label className="inline-field">
          相同区域上下文
          <select
            value={contextLines === null ? 'all' : String(contextLines)}
            onChange={(e) =>
              onContextLines(e.target.value === 'all' ? null : Number(e.target.value))
            }
          >
            <option value="all">全部展开</option>
            <option value="0">0 行</option>
            <option value="3">3 行</option>
            <option value="5">5 行</option>
            <option value="10">10 行</option>
          </select>
        </label>
      </fieldset>
    </div>
  );
}
