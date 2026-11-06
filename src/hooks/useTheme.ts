import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/** localStorage 键名。只存用户显式选择过的主题。 */
export const THEME_STORAGE_KEY = 'diff-editor:theme';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * 初始主题：用户选过就用选过的，否则跟随系统。
 * localStorage 在隐私模式等环境可能抛错，失败时退回系统偏好。
 */
export function getInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // 忽略：读不到就按系统偏好
  }
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/** 把主题写到 <html data-theme>，CSS 变量据此切换。 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  // 让原生控件（滚动条、输入框、select）也跟着换色
  document.documentElement.style.colorScheme = theme;
}

/** 主题状态 + 一键切换，切换结果持久化到 localStorage。 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // 存不下也不影响本次切换
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
