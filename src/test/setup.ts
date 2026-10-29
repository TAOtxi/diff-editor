import '@testing-library/jest-dom/vitest';

/**
 * jsdom 不带 canvas 实现，`getContext('2d')` 每次都会往 stderr 打
 * 「Not implemented」噪音。布局代码本来就对 null 做了兜底（退回默认字宽），
 * 这里直接给个空实现，让测试输出干净。
 */
HTMLCanvasElement.prototype.getContext = (() =>
  null) as unknown as HTMLCanvasElement['getContext'];
