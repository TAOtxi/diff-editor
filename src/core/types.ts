/**
 * 差异编辑器核心类型定义。
 *
 * 设计要点：文档以「行数组」为唯一真源，差异块只持有行区间下标，
 * 不复制行内容，避免两份状态不一致。
 */

/** 文档所属栏位。 */
export type Side = 'left' | 'right';

/** 行尾风格。 */
export type Eol = 'lf' | 'crlf' | 'cr';

/** 对比选项。任何一项变化都会触发差异重算。 */
export interface CompareOptions {
  /** 忽略行尾空白（行末的空格与制表符）。 */
  ignoreTrailingWhitespace: boolean;
  /** 忽略全部空白（行内所有空白字符）。 */
  ignoreAllWhitespace: boolean;
  /** 忽略大小写。 */
  ignoreCase: boolean;
  /** 忽略空行（空行不参与差异判定）。 */
  ignoreBlankLines: boolean;
  /** 归一化行尾（CRLF/CR 视同 LF）。 */
  normalizeEol: boolean;
  /** 制表符按几个空格展开参与对比，0 表示不展开。 */
  tabWidth: number;
}

export const DEFAULT_COMPARE_OPTIONS: CompareOptions = {
  ignoreTrailingWhitespace: false,
  ignoreAllWhitespace: false,
  ignoreCase: false,
  ignoreBlankLines: false,
  normalizeEol: true,
  tabWidth: 0,
};

/** 差异块类型。 */
export type BlockKind =
  /** 两侧内容一致。 */
  | 'equal'
  /** 仅左侧存在（右侧被删除）。 */
  | 'delete'
  /** 仅右侧存在（右侧新增）。 */
  | 'insert'
  /** 两侧都有内容且不同，即冲突。 */
  | 'conflict';

/** 左闭右开的行区间。start === end 表示空区间。 */
export interface LineRange {
  start: number;
  end: number;
}

/** 一个差异块。行区间指向对应文档的行数组下标。 */
export interface DiffBlock {
  /** 块在当前差异结果中的序号，从 0 开始。 */
  index: number;
  kind: BlockKind;
  left: LineRange;
  right: LineRange;
}

/** 行内片段类型，用于冲突块的字符级高亮。 */
export type InlineKind = 'equal' | 'removed' | 'added';

/** 行内差异片段。 */
export interface InlineSegment {
  kind: InlineKind;
  text: string;
}

/** 一对行的行内差异结果。 */
export interface InlineLineDiff {
  left: InlineSegment[];
  right: InlineSegment[];
}

/**
 * 块级操作。四种操作的共同不变式：执行后该块左右两侧内容一致，
 * 差异被消解，总差异数减一。
 *
 * 对单边差异块（delete/insert）而言：
 * - delete 块（左有右无）：`takeLeft` = 复制到右侧，`takeRight` = 删除该差异
 * - insert 块（左无右有）：`takeRight` = 复制到左侧，`takeLeft` = 删除该差异
 *
 * UI 层按块类型给出符合直觉的中文标签，底层只有这四种语义。
 */
export type BlockOperation =
  /** 两侧均采用左侧内容。 */
  | 'takeLeft'
  /** 两侧均采用右侧内容。 */
  | 'takeRight'
  /** 两侧均采用「左 + 右」拼接内容。 */
  | 'keepBoth'
  /** 两侧均删除该块内容。 */
  | 'deleteBoth';

/** 「保留两者」的拼接顺序。 */
export type KeepBothOrder = 'leftFirst' | 'rightFirst';

/** 「保留两者」的行为配置。 */
export interface KeepBothConfig {
  order: KeepBothOrder;
  /** 是否插入 git 风格冲突标记。 */
  insertMarkers: boolean;
  markerLeft: string;
  markerMiddle: string;
  markerRight: string;
}

export const DEFAULT_KEEP_BOTH_CONFIG: KeepBothConfig = {
  order: 'leftFirst',
  insertMarkers: false,
  markerLeft: '<<<<<<< 左侧',
  markerMiddle: '=======',
  markerRight: '>>>>>>> 右侧',
};

/** 一次差异计算的完整结果。 */
export interface DiffResult {
  blocks: DiffBlock[];
  /** 非 equal 块的序号列表，即可导航的差异位置。 */
  changedIndexes: number[];
  stats: DiffStats;
}

export interface DiffStats {
  /** 差异块总数（不含 equal）。 */
  changedBlocks: number;
  deleteBlocks: number;
  insertBlocks: number;
  conflictBlocks: number;
  /** 左侧涉及变更的行数。 */
  leftChangedLines: number;
  /** 右侧涉及变更的行数。 */
  rightChangedLines: number;
}
