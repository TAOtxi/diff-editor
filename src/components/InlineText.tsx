import type { InlineSegment } from '../core/types';
import { highlightLine, type HighlightLanguage, type HighlightToken } from '../core/highlight';

interface InlineTextProps {
  segments: InlineSegment[] | undefined;
  fallback: string;
  /** 整行语法高亮片段（可选）。提供后，无行内差异的行按语法着色。 */
  tokens?: HighlightToken[];
  /** 语法高亮语言，用于在行内差异片段内做二次着色。 */
  language?: HighlightLanguage;
}

/**
 * 渲染一行文本，叠加「语法高亮」与「行内差异高亮」两个正交维度。
 *
 * 优先级：
 * - 有行内差异 segments → 按差异分段，段内再按语法 token 二次着色
 * - 有语法高亮 tokens 且无行内差异 → 按语法 token 着色
 * - 都没有 → 纯文本兜底，保证任何情况内容完整
 *
 * 语法高亮改变的是文字颜色，行内差异改变的是背景色，二者可共存不冲突。
 */
export function InlineText({ segments, fallback, tokens, language }: InlineTextProps) {
  // 有行内差异：按差异分段，段内做语法二次着色
  if (segments && segments.length > 0) {
    return (
      <span className="line-text">
        {segments.map((seg, i) => {
          const cls = seg.kind === 'equal' ? undefined : `inline-${seg.kind}`;
          return (
            <span key={i} className={cls}>
              {renderTokens(highlightLine(seg.text, language ?? 'plain'))}
            </span>
          );
        })}
      </span>
    );
  }

  // 无行内差异：走语法高亮或纯文本
  if (tokens && tokens.length > 0) {
    return <span className="line-text">{renderTokens(tokens)}</span>;
  }
  return <span className="line-text">{fallback === '' ? '\u00A0' : fallback}</span>;
}

/** 把高亮 token 列表渲染为带 scope class 的 span。 */
function renderTokens(tokens: HighlightToken[]) {
  if (tokens.length === 0) return null;
  return tokens.map((t, i) =>
    t.scope === 'plain' ? (
      <span key={i}>{t.text}</span>
    ) : (
      <span key={i} className={`tok-${t.scope}`}>
        {t.text}
      </span>
    ),
  );
}
