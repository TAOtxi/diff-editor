import { act, renderHook } from '@testing-library/react';
import { THEME_STORAGE_KEY, getInitialTheme, useTheme } from './useTheme';

function mockSystemDark(dark: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
  })) as unknown as typeof window.matchMedia;
}

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    mockSystemDark(false);
  });

  it('没存过时跟随系统偏好', () => {
    expect(getInitialTheme()).toBe('light');
    mockSystemDark(true);
    expect(getInitialTheme()).toBe('dark');
  });

  it('存过的选择优先于系统偏好', () => {
    mockSystemDark(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(getInitialTheme()).toBe('light');
  });

  it('忽略非法的存储值', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(getInitialTheme()).toBe('light');
  });

  it('切换后写到 <html data-theme> 并持久化', () => {
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
