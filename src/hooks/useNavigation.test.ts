import { describe, expect, it } from 'vitest';
import { clampToNearest } from './useNavigation';

describe('clampToNearest', () => {
  it('空列表返回 -1', () => {
    expect(clampToNearest([], 3)).toBe(-1);
  });

  it('原位置仍存在时返回原位置', () => {
    expect(clampToNearest([1, 3, 5], 3)).toBe(3);
  });

  it('原位置消失后取其后的第一个', () => {
    expect(clampToNearest([1, 5, 7], 3)).toBe(5);
  });

  it('原位置在末尾之后则取最后一个', () => {
    expect(clampToNearest([1, 3], 9)).toBe(3);
  });

  it('原位置在最前则取第一个', () => {
    expect(clampToNearest([4, 6], 0)).toBe(4);
  });

  it('单个差异时总是返回它', () => {
    expect(clampToNearest([2], 0)).toBe(2);
    expect(clampToNearest([2], 5)).toBe(2);
  });
});
