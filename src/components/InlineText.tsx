import type { InlineSegment } from '../core/types';

interface InlineTextProps {
  segments: InlineSegment[] | undefined;
  fallback: string;
}

/**
 * 渲染带行内高亮的一行文本。
 *
 * 无行内差异信息时退化为纯文本，保证任何情况下内容都完整显示。
 */
export function InlineText({ segments, fallback }: InlineTextProps) {
  if (!segments || segments.length === 0) {
    return <span className="line-text">{fallback === '' ? '\u00A0' : fallback}</span>;
  }

  return (
    <span className="line-text">
      {segments.map((seg, i) =>
        seg.kind === 'equal' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <span key={i} className={`inline-${seg.kind}`}>
            {seg.text}
          </span>
        ),
      )}
    </span>
  );
}
