/**
 * 语法高亮 Hook：根据文件扩展名推断语言，并对整份文档做词法着色。
 *
 * 高亮结果由文档派生、单独持有，不进 reducer（与差异结果同理）。
 * 用 useMemo 缓存，语言或文档变化时才重算。虚拟滚动只渲染视口内的行，
 * 但这里对全文档高亮，保证滚动到任意行时已有结果；若文档极大，
 * 可改为惰性高亮（按可见行），当前规模下全量高亮足够快。
 */

import { useMemo } from 'react';
import { highlightLine, languageFromName, type HighlightLanguage, type HighlightToken } from '../core/highlight';

/** 高亮配置：自动跟随文件名，或手动指定语言。 */
export type HighlightMode = 'auto' | 'off';

export interface HighlightResult {
  /** 实际生效的语言（auto 推断失败时可能是 plain）。 */
  language: HighlightLanguage;
  /** 每行的高亮片段；行下标与文档行下标一致。 */
  lines: HighlightToken[][];
  /** 是否真正在做高亮（language !== plain）。 */
  active: boolean;
}

/**
 * 计算一份文档的高亮结果。
 *
 * @param docLines 文档行数组
 * @param fileName 文件名，用于 auto 模式推断语言
 * @param mode 高亮模式：auto 或 off
 * @param forcedLanguage 手动指定的语言（预留，当前 UI 仅 auto/off）
 */
export function useHighlight(
  docLines: readonly string[],
  fileName: string,
  mode: HighlightMode,
  forcedLanguage?: HighlightLanguage,
): HighlightResult {
  return useMemo(() => {
    if (mode === 'off') {
      return { language: 'plain', lines: [], active: false };
    }

    const language = forcedLanguage ?? languageFromName(fileName);
    const active = language !== 'plain';
    const lines = active ? docLines.map((line) => highlightLine(line, language)) : [];
    return { language, lines, active };
  }, [docLines, fileName, mode, forcedLanguage]);
}
