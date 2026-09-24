import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * 交互层测试。
 *
 * jsdom 不提供 Worker 与 ResizeObserver，这里补上最小替身：
 * useDiff 在没有 Worker 时会走同步计算路径，正好适合测试。
 */
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // 让虚拟滚动认为视口足够高，从而渲染出所有行
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 2000,
  });
  vi.stubGlobal('confirm', () => true);
});

/** 通过「粘贴」对话框载入两侧内容。 */
async function loadBothSides(left: string, right: string): Promise<void> {
  const user = userEvent.setup();
  const pasteButtons = screen.getAllByRole('button', { name: '粘贴' });

  await user.click(pasteButtons[0]);
  const leftBox = screen.getByRole('dialog', { name: '粘贴到左侧' });
  await user.type(within(leftBox).getByRole('textbox'), left);
  await user.click(within(leftBox).getByRole('button', { name: '载入' }));

  await user.click(screen.getAllByRole('button', { name: '粘贴' })[1]);
  const rightBox = screen.getByRole('dialog', { name: '粘贴到右侧' });
  await user.type(within(rightBox).getByRole('textbox'), right);
  await user.click(within(rightBox).getByRole('button', { name: '载入' }));
}

describe('App 初始状态', () => {
  it('显示空态提示', () => {
    render(<App />);
    expect(screen.getByText('打开两个文件开始对比。')).toBeInTheDocument();
  });

  it('未载入内容时导航按钮禁用', () => {
    render(<App />);
    expect(screen.getByTitle('下一个差异 (Alt+↓)')).toBeDisabled();
    expect(screen.getByTitle('上一个差异 (Alt+↑)')).toBeDisabled();
  });

  it('初始时撤销与重做都不可用', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重做' })).toBeDisabled();
  });
});

describe('App 差异展示与导航', () => {
  it('载入两侧内容后显示差异计数', async () => {
    render(<App />);
    await loadBothSides('a\nx\nc', 'a\ny\nc');
    await waitFor(() => {
      expect(screen.getByText(/共?第 \d+ \/ 1 个差异|第 1 \/ 1 个差异/)).toBeInTheDocument();
    });
  });

  it('内容相同时提示没有差异', async () => {
    render(<App />);
    await loadBothSides('same\ncontent', 'same\ncontent');
    await waitFor(() => {
      expect(screen.getByText('两份内容完全一致，没有差异。')).toBeInTheDocument();
    });
  });

  it('点击下一个差异后计数器定位到第一个', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('1\nx\n3\ny\n5', '1\na\n3\nb\n5');
    await waitFor(() => expect(screen.getByText(/\/ 2 个差异|无差异/)).toBeInTheDocument());

    await user.click(screen.getByTitle('下一个差异 (Alt+↓)'));
    await waitFor(() => {
      expect(screen.getByText('第 1 / 2 个差异')).toBeInTheDocument();
    });
  });

  it('连续点击下一个差异会前进', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('1\nx\n3\ny\n5', '1\na\n3\nb\n5');
    await waitFor(() => expect(screen.getByText(/\/ 2 个差异/)).toBeInTheDocument());

    await user.click(screen.getByTitle('下一个差异 (Alt+↓)'));
    await user.click(screen.getByTitle('下一个差异 (Alt+↓)'));
    await waitFor(() => expect(screen.getByText('第 2 / 2 个差异')).toBeInTheDocument());
  });
});

describe('App 块级操作', () => {
  it('采用左侧后差异消失', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('a\nx\nc', 'a\ny\nc');
    await waitFor(() => expect(screen.getByText(/1 个差异/)).toBeInTheDocument());

    const takeLeft = await screen.findByRole('button', { name: /采用左侧/ });
    await user.click(takeLeft);

    await waitFor(() => {
      expect(screen.getByText('两份内容完全一致，没有差异。')).toBeInTheDocument();
    });
  });

  it('两者都保留后差异消失且行数增加', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('a\nx\nc', 'a\ny\nc');
    await waitFor(() => expect(screen.getByText(/1 个差异/)).toBeInTheDocument());

    const keepBoth = await screen.findByRole('button', { name: /两者都保留/ });
    await user.click(keepBoth);

    await waitFor(() => {
      expect(screen.getByText('两份内容完全一致，没有差异。')).toBeInTheDocument();
      // 原本各 3 行，保留两者后变为 4 行
      expect(screen.getAllByText('4 行')).toHaveLength(2);
    });
  });

  it('操作后可以撤销回到有差异的状态', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('a\nx\nc', 'a\ny\nc');
    await waitFor(() => expect(screen.getByText(/1 个差异/)).toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: /采用左侧/ }));
    await waitFor(() => expect(screen.getByText('两份内容完全一致，没有差异。')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => {
      expect(screen.queryByText('两份内容完全一致，没有差异。')).not.toBeInTheDocument();
    });
  });

  it('全部采用左侧后两侧行数一致', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('1\nx\n3\ny', '1\na\n3\nb\nextra');
    await waitFor(() => expect(screen.getByText(/个差异/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '全采用左' }));
    await waitFor(() => {
      expect(screen.getByText('两份内容完全一致，没有差异。')).toBeInTheDocument();
    });
  });

  it('删除该差异会移除单边内容', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('a\nb\nc', 'a\nc');
    await waitFor(() => expect(screen.getByText(/1 个差异/)).toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: /删除该差异/ }));
    await waitFor(() => {
      expect(screen.getByText('两份内容完全一致，没有差异。')).toBeInTheDocument();
      expect(screen.getAllByText('2 行')).toHaveLength(2);
    });
  });
});

describe('App 对比选项', () => {
  it('开启忽略大小写后差异消失', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('Hello', 'hello');
    await waitFor(() => expect(screen.getByText(/1 个差异/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '选项' }));
    await user.click(screen.getByLabelText('忽略大小写'));

    await waitFor(() => {
      expect(screen.getByText('两份内容完全一致，没有差异。')).toBeInTheDocument();
    });
  });

  it('开启忽略全部空白后差异消失', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('a b', 'ab');
    await waitFor(() => expect(screen.getByText(/1 个差异/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '选项' }));
    await user.click(screen.getByLabelText('忽略全部空白'));

    await waitFor(() => {
      expect(screen.getByText('两份内容完全一致，没有差异。')).toBeInTheDocument();
    });
  });
});

describe('App 交换与编辑', () => {
  it('交换两侧后文件名互换', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('a', 'b');
    await waitFor(() => expect(screen.getByText('粘贴内容（左）')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '交换' }));
    await waitFor(() => {
      const headers = screen.getAllByText(/粘贴内容/);
      expect(headers[0]).toHaveTextContent('粘贴内容（右）');
    });
  });

  it('双击行可进入单行编辑并提交', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loadBothSides('a\nx\nc', 'a\ny\nc');
    await waitFor(() => expect(screen.getByText(/1 个差异/)).toBeInTheDocument());

    // 左侧第 2 行内容为 x，双击后应出现输入框
    const target = screen.getByText('x');
    await user.dblClick(target);
    const input = await screen.findByLabelText('编辑第 2 行');
    expect(input).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'y');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('两份内容完全一致，没有差异。')).toBeInTheDocument();
    });
  });
});
