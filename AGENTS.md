# AGENTS.md — Agent 上手指南

> 本文档面向**下一个接手这个项目的 AI Agent / 开发者**。目标是读完就能改代码、加功能、跑测试而不踩坑。
> 面向最终用户的说明见 `README.md`；本文聚焦「代码如何组织、数据如何流动、有哪些约定和坑」。

---

## 1. 一句话概览

**纯前端、纯本地的双文件（2-way）差异对比与合并编辑器。** 文件内容只在浏览器内存处理，不经过任何服务端。目标浏览器是 Chrome，直接使用 File System Access API 读写本地文件，不做降级。

- 技术栈：React 19 + TypeScript 5 + Vite 7 + Vitest 3，包管理器 **pnpm 11**。
- 引擎层（`src/core/`）全部是**纯函数**，与 UI 完全解耦，是单测和正确性验证的主战场。
- 差异计算在 **Web Worker** 中执行，渲染用固定行高虚拟滚动，能扛住 10 万行。

---

## 2. 快速启动（务必按这个顺序）

```bash
corepack enable          # 切到 package.json 锁定的 pnpm 版本
pnpm install             # preinstall 钩子会拦截 npm/yarn，不要用它们
pnpm dev                 # http://localhost:5273
pnpm check               # tsc + eslint + vitest 一次性全跑
pnpm build               # 产物在 dist/
```

常用单命令：

| 命令 | 作用 |
|---|---|
| `pnpm test` | 跑一遍全部单测 |
| `pnpm test:watch` | 监听模式 |
| `pnpm coverage` | 引擎层（`src/core/**`）覆盖率 |
| `pnpm typecheck` | 仅 `tsc -b` |
| `pnpm lint` | 仅 eslint |
| `pnpm format` | prettier 格式化 `src/**/*.{ts,tsx,css}` |

**注意**：`pnpm check` 是提交前的最低门槛，CI 大概率依赖它，改完代码先跑它。

---

## 3. 目录结构与职责边界

```text
src/
├── core/          # ★ 纯函数引擎，零 UI 依赖，唯一被单测重点覆盖的层
│   ├── myers.ts       # Myers 线性空间差异算法（LCS）
│   ├── diff.ts        # 行级差异 → 差异块（块序列）
│   ├── inline.ts      # 行内词级差异（仅用于冲突块高亮，不参与操作）
│   ├── operations.ts  # 四种块级操作（takeLeft/takeRight/keepBoth/deleteBoth）
│   ├── text.ts        # 行切分、EOL 探测、BOM、二进制判定、对比归一化
│   ├── highlight.ts   # 语法高亮 tokenizer（零依赖、纯函数，按扩展名推断语言）
│   └── types.ts       # 全部核心类型与默认值
├── state/         # reducer（store.ts）+ 撤销栈（history.ts）
├── view/rows.ts   # 差异块 → 渲染行（含 equal 块折叠）
├── worker/        # diff.worker.ts —— 差异计算 Worker
├── fs/            # fileAccess.ts —— File System Access API 封装
├── hooks/         # useDiff（Worker 调度）、useHighlight（语法高亮）、useNavigation
├── components/    # 纯 UI（DiffView / Toolbar / FileHeader / ...）
├── App.tsx        # 顶层编排：reducer + hooks + 快捷键 + 保存流程
├── main.tsx       # 入口，只挂载 App
└── test/setup.ts  # vitest 全局 setup（jest-dom 等）
```

**依赖方向约定**：`components` → `App` → `hooks/state/view` → `core`。`core/` 不 import 任何其他目录；`state/` 只依赖 `core/`。改代码时不要破坏这个单向依赖，否则会把纯函数引擎和 React 状态耦合在一起，破坏可测试性。

---

## 4. 核心模型与数据流（重点理解这段）

### 4.1 文档是唯一真源

文档在 reducer 里存成**行数组** `lines: string[]`（不含行尾符），加一份 `TextMeta`（`eol` / `hasBom` / `endsWithNewline`，保存时原样还原）。

**关键设计**：`DiffBlock`（差异块）只持有行区间下标 `left: LineRange` / `right: LineRange`，**不复制行内容**。差异结果由文档 + 对比选项**派生**，不进 reducer state，避免两份状态不一致。

### 4.2 差异块四类

| 类型 | 含义 | 左栏 | 右栏 |
|---|---|---|---|
| `equal` | 相同 | 有 | 有（一致） |
| `delete` | 仅左侧存在 | 有 | 空 |
| `insert` | 仅右侧存在 | 空 | 有 |
| `conflict` | 双边都有且不同（= 冲突） | 有 | 有（不同） |

### 4.3 四种块操作（底层语义只有这四种）

不变式：**执行后该块左右两侧内容一致，差异总数减一。**

| 操作 | 结果 |
|---|---|
| `takeLeft` | 两侧均采用左侧内容 |
| `takeRight` | 两侧均采用右侧内容 |
| `keepBoth` | 两侧均采用「左 + 右」拼接 |
| `deleteBoth` | 两侧均删除该块 |

单边块（`delete`/`insert`）上这四种语义会呈现为「复制」或「删除」，中文标签由 `operations.ts` 的 `operationLabel()` 统一给出，UI 不要自己硬编码文案。`availableOperations()` 决定某类块上显示哪些按钮：`conflict` 四种全给；`delete`/`insert` 只给 `takeLeft`/`takeRight`（`keepBoth` 在单边块上等价，不提供）。

### 4.4 数据流全景

```
打开/粘贴/拖拽文件
   │  fs/fileAccess.readFile() → splitLines() → { lines, meta }
   ▼
reducer  dispatch('loadDocument' | 'replaceLines' | ...)
   │  状态：left.lines / right.lines / options / keepBoth / history / activeDiff
   ▼
useDiff(left.lines, right.lines, options)
   │  防抖 250ms → Worker 计算 → DiffResult { blocks, changedIndexes, stats }
   ▼
view/rows.buildRows()  →  渲染行（含 equal 折叠、上下文行数）
   ▼
DiffView 渲染 + 中缝操作按钮 → dispatch('applyOperation')
   ▼
operations.applyBlockOperation() → 新行数组 → reducer 写回 + 记录历史
```

---

## 5. 关键实现细节（改代码前先读这里）

### 5.1 撤销栈：快照而非反向补丁

`state/history.ts` 保存**行数组快照**。块操作与手动编辑的反向补丁形式不统一，快照最简单可靠。内存通过两个手段控制：
- `limit`（默认 200 步）上限，超限裁剪最旧；
- `mergeKey` 合并：相邻且 `mergeKey` 相同的编辑会替换栈顶，连续打字合并为一步。行内编辑的 `mergeKey` 是 `edit-${side}-${lineNumber}`（见 `App.tsx` 的 `handleEditLine`）。

撤销/重做通过 `cursor` 指针移动，而不是弹栈；压入新历史时若不在栈顶会**丢弃后续分支**（与主流编辑器一致）。

### 5.2 Worker 调度与过期结果

`hooks/useDiff.ts`：Worker 只创建一次，卸载时 terminate。每次请求带自增 `seq`，主线程只接受 `seq >= acceptedRef` 的响应，丢弃过期的慢请求。**无 Worker 环境（测试）回退到同步计算**，测试覆盖率依赖这条路径。

### 5.3 文件保存的元信息还原

`core/text.ts` 的 `splitLines` / `joinLines` 成对使用：行数组不含行尾符，`endsWithNewline` 用 meta 记录而非数组尾部空串，保证行号与用户看到的一致。保存必须走 `joinLines(lines, meta)`，否则会丢 BOM / 行尾风格 / 末尾换行。

### 5.4 文件句柄不进 reducer

`FileSystemFileHandle` 不可序列化，也不该进撤销历史，所以放在 `App.tsx` 的 `handlesRef`（`useRef`）里，与 reducer 的 `hasHandle` 布尔标记分开。改动保存逻辑时别试图把它塞进 state。

### 5.5 批量操作必须从后往前

`operations.ts` 的 `applyBlockOperations`：对多个块应用同一操作时**按 `left.start` 降序**处理，否则前面的块改变行数后，后面块的下标失效。单个块操作 `applyBlockOperation` 没有此问题。

### 5.6 归一化只影响判定，不改内容

`text.ts` 的 `normalizeLine` 生成对比用的行键（忽略空白/大小写等），但**不修改文档内容**，显示与保存始终是用户原始文本。对比选项 `CompareOptions` 任何一项变化都会触发 `useDiff` 重算。

---

## 6. 测试策略

- 引擎层 `src/core/**` 有完整单测，是正确性验证的核心：
  - `myers.test.ts`：用 DP 版 LCS 作参照，对 ~580 组随机序列断言「equal 段总长 = LCS 长度」= 最优解，并校验脚本能无损回放出两侧原序列。
  - `operations.test.ts`：四种操作 × 七种场景，逐一断言「执行后差异数恰好减一」的不变式。
- 其余单测：`state/history.test.ts`、`view/rows.test.ts`、`hooks/useNavigation.test.ts`、`App.test.tsx`。
- 测试环境：`jsdom` + `globals: true`（无需手动 import `describe/it/expect`），setup 在 `src/test/setup.ts`。
- **改引擎层逻辑必须先跑 `pnpm coverage` 并补测试**，尤其是 myers 和 operations，它们守卫着整个工具的可靠性。

---

## 7. 约定与坑（速查）

1. **只用 pnpm**。preinstall 钩子会拦截 npm/yarn，避免第二份锁文件。
2. **`core/` 保持纯函数、零依赖**。不要往里 import React 或 DOM，否则破坏可测试性。
3. **行是操作的最小单位**。冲突块内做词级高亮（`inline.ts`），但不支持单独采用行内片段。
4. **两栏共用一个行列表**（`view/rows.ts` 输出 `displayRows`），左右天然对齐，别改成分别渲染再同步滚动。
5. **整篇编辑走对话框**（`TextDialog`），因为虚拟滚动只渲染视口内的行，就地编辑整篇会丢失未渲染部分的编辑状态。
6. **UI 文案（尤其操作标签）走 `operationLabel()`**，别在组件里硬编码。
7. **浏览器能力检测**：`isFileSystemAccessSupported()` 启动时检测一次，不支持就显示明确提示，不做静默降级成下载。
8. **大文件阈值**：`LARGE_FILE_BYTES = 5MB`、`LARGE_FILE_LINES = 100_000`，超过会 `window.confirm` 后再打开；含 NUL 字节按二进制拦截。
9. **GitHub Pages 子路径**：`vite.config.ts` 的 `base` 由 `BASE_PATH` 环境变量注入（`/diff-editor/`），CI 部署依赖它，别把 base 写死。
10. **中文 vs 英文文案**：界面是中文的，新加的 UI 文案用中文，与现有保持一致。

---

## 8. 已知边界（不要误以为要做）

以下**不在本期范围**，接手时不要误当需求去实现（除非明确被要求）：

- 目录对比、三方合并（base + left + right）、git 集成。
- 深色主题。
- `equal` 块折叠状态不随文档改动保留（折叠上下文行数 `contextLines` 可配，默认 3）。
- 语法高亮为**轻量词法着色**（非 AST 级，不区分上下文），不引入 highlight.js/Prism/Shiki 等库；语言由扩展名推断，可在「选项 → 显示 → 语法高亮」关闭。

---

## 9. 改动某类功能的快速定位

| 想做什么 | 改哪里 |
|---|---|
| 改差异算法 / 加对比选项 | `core/myers.ts`、`core/diff.ts`、`core/text.ts`（+ `types.ts` 的 `CompareOptions`），补测试 |
| 改块操作行为 / 加操作 | `core/operations.ts`（+ `types.ts` 的 `BlockOperation`），补 `operations.test.ts` |
| 加状态 / 改撤销逻辑 | `state/store.ts`（reducer + Action）、`state/history.ts` |
| 改渲染 / 折叠 / 行高 | `view/rows.ts`、`components/DiffView.tsx` |
| 改文件读写 / 保存 | `fs/fileAccess.ts`、`App.tsx` 的 `handleSave` 系列 |
| 改快捷键 | `App.tsx` 的全局 `onKeyDown`（约 213–250 行） |
| 改 Worker / 性能 | `worker/diff.worker.ts`、`hooks/useDiff.ts` |
| 改顶部工具栏 / 统计 | `components/Toolbar.tsx`、`components/OptionsPanel.tsx` |
