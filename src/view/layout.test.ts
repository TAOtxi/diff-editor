import type { Row } from './rows';
import {
  ROW_HEIGHT,
  TAB_SIZE,
  isWideChar,
  maxVisualUnits,
  uniformLayout,
  visualUnits,
  wrappedLayout,
} from './layout';

function row(partial: Partial<Row> & { leftLine: number | null; rightLine: number | null }): Row {
  return {
    key: 0,
    blockIndex: 0,
    kind: 'equal',
    ...partial,
  } as Row;
}

describe('isWideChar', () => {
  it('ASCII 按半角', () => {
    for (const ch of 'aZ0 _.') expect(isWideChar(ch.codePointAt(0)!)).toBe(false);
  });

  it('中日韩与全角标点按全角', () => {
    for (const ch of '中あ한Ａ，。') expect(isWideChar(ch.codePointAt(0)!)).toBe(true);
  });

  it('emoji 按全角', () => {
    expect(isWideChar('🙂'.codePointAt(0)!)).toBe(true);
  });
});

describe('visualUnits', () => {
  it('纯 ASCII 宽度等于字符数', () => {
    expect(visualUnits('hello')).toBe(5);
    expect(visualUnits('')).toBe(0);
  });

  it('全角字符按 wideUnits 计，默认 2', () => {
    expect(visualUnits('中文')).toBe(4);
    expect(visualUnits('中文', TAB_SIZE, 1.6)).toBeCloseTo(3.2);
  });

  it('制表符对齐到下一个制表位', () => {
    expect(TAB_SIZE).toBe(4);
    // 'a' 占 1 列，tab 补到 4，'b' 再加 1
    expect(visualUnits('a\tb')).toBe(5);
    // 刚好在制表位上时，一个 tab 就占满一格
    expect(visualUnits('abcd\te')).toBe(9);
    expect(visualUnits('\t')).toBe(4);
  });

  it('代理对不被拆坏', () => {
    expect(visualUnits('🙂')).toBe(2);
  });
});

describe('maxVisualUnits', () => {
  it('取最长行', () => {
    expect(maxVisualUnits(['a', 'aaaa', 'aa'])).toBe(4);
  });

  it('空列表为 0', () => {
    expect(maxVisualUnits([])).toBe(0);
  });

  it('稀疏快路径不改变结果', () => {
    const lines = ['short', '中等长度的一行', 'x'.repeat(40), '中'];
    const naive = Math.max(...lines.map((l) => visualUnits(l)));
    expect(maxVisualUnits(lines)).toBe(naive);
  });

  it('制表符不会因为长度短而低估', () => {
    // 长度只有 3，但展开后是 12 列，必须比 4 列的长
    expect(maxVisualUnits(['\t\t\t', 'abcd'])).toBe(12);
  });
});

describe('uniformLayout', () => {
  const layout = uniformLayout(100, 800);

  it('总高度与行宽', () => {
    expect(layout.totalHeight).toBe(100 * ROW_HEIGHT);
    expect(layout.rowWidth).toBe(800);
  });

  it('高度恒定、偏移按下标线性', () => {
    expect(layout.heightOf(7)).toBe(ROW_HEIGHT);
    expect(layout.topOf(7)).toBe(7 * ROW_HEIGHT);
  });

  it('indexAt 命中与夹紧', () => {
    expect(layout.indexAt(0)).toBe(0);
    expect(layout.indexAt(ROW_HEIGHT - 1)).toBe(0);
    expect(layout.indexAt(ROW_HEIGHT)).toBe(1);
    expect(layout.indexAt(9_999_999)).toBe(99);
    expect(layout.indexAt(-50)).toBe(0);
  });

  it('空列表不会越界', () => {
    const empty = uniformLayout(0, 800);
    expect(empty.totalHeight).toBe(0);
    expect(empty.indexAt(500)).toBe(0);
  });
});

describe('wrappedLayout', () => {
  // columns = 10：第 1 行 5 列不折；第 2 行 30 列折 3 行；第 3 行两侧都很短
  const rows: Row[] = [
    row({ key: 0, leftLine: 0, rightLine: 0 }),
    row({ key: 1, leftLine: 1, rightLine: null, kind: 'delete' }),
    row({ key: 2, leftLine: 2, rightLine: 1 }),
    row({ key: 3, leftLine: null, rightLine: null, collapsed: { count: 9, leftStart: 0, rightStart: 0 } }),
  ];
  const leftLines = ['hello', 'a'.repeat(30), 'abc'];
  const rightLines = ['hello', 'de'];

  const layout = wrappedLayout({
    rows,
    leftLines,
    rightLines,
    columns: 10,
    rowWidth: 600,
  });

  it('短行保持单行高', () => {
    expect(layout.heightOf(0)).toBe(ROW_HEIGHT);
    expect(layout.heightOf(2)).toBe(ROW_HEIGHT);
  });

  it('长行按折行数放大行高', () => {
    // 30 列 / 每行 10 列 = 3 行
    expect(layout.heightOf(1)).toBe(3 * ROW_HEIGHT);
  });

  it('折叠占位行始终单行高', () => {
    expect(layout.heightOf(3)).toBe(ROW_HEIGHT);
  });

  it('行高取左右两侧较高者', () => {
    const tall = wrappedLayout({
      rows: [row({ leftLine: 0, rightLine: 0 })],
      leftLines: ['a'],
      rightLines: ['b'.repeat(25)],
      columns: 10,
      rowWidth: 600,
    });
    expect(tall.heightOf(0)).toBe(3 * ROW_HEIGHT);
  });

  it('偏移量是行高的前缀和', () => {
    expect(layout.topOf(0)).toBe(0);
    expect(layout.topOf(1)).toBe(ROW_HEIGHT);
    expect(layout.topOf(2)).toBe(4 * ROW_HEIGHT);
    expect(layout.topOf(3)).toBe(5 * ROW_HEIGHT);
    expect(layout.totalHeight).toBe(6 * ROW_HEIGHT);
  });

  it('indexAt 在变高行上定位正确', () => {
    expect(layout.indexAt(0)).toBe(0);
    expect(layout.indexAt(ROW_HEIGHT - 1)).toBe(0);
    expect(layout.indexAt(ROW_HEIGHT)).toBe(1);
    expect(layout.indexAt(3 * ROW_HEIGHT)).toBe(1);
    expect(layout.indexAt(4 * ROW_HEIGHT)).toBe(2);
    expect(layout.indexAt(5 * ROW_HEIGHT)).toBe(3);
    expect(layout.indexAt(1_000_000)).toBe(3);
  });

  it('indexAt 与线性扫描一致', () => {
    const tops = [0, 1, 2, 3].map((i) => layout.topOf(i));
    for (let y = -5; y < layout.totalHeight + 10; y += 3) {
      let expected = 0;
      for (let i = 0; i < tops.length; i += 1) if (tops[i] <= y) expected = i;
      expect(layout.indexAt(y)).toBe(expected);
    }
  });

  it('全角字符按两列折算', () => {
    const wide = wrappedLayout({
      rows: [row({ leftLine: 0, rightLine: null })],
      leftLines: ['中'.repeat(10)],
      rightLines: [],
      columns: 10,
      rowWidth: 600,
    });
    // 10 个全角 = 20 列，10 列一行 → 折 2 行
    expect(wide.heightOf(0)).toBe(2 * ROW_HEIGHT);
  });

  it('空列表不会越界', () => {
    const empty = wrappedLayout({ rows: [], leftLines: [], rightLines: [], columns: 10, rowWidth: 600 });
    expect(empty.totalHeight).toBe(0);
    expect(empty.indexAt(100)).toBe(0);
  });

  it('列数被夹到至少 1，避免除零', () => {
    const narrow = wrappedLayout({
      rows: [row({ leftLine: 0, rightLine: null })],
      leftLines: ['abc'],
      rightLines: [],
      columns: 0,
      rowWidth: 600,
    });
    expect(narrow.heightOf(0)).toBe(3 * ROW_HEIGHT);
  });
});
