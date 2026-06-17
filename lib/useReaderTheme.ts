import { useEffect, useState } from "react";

export type ReaderTheme = "day" | "night";

const STORAGE_KEY = "newbook:reader-theme";
const DEFAULT_THEME: ReaderTheme = "night";

/**
 * 阅读器日/夜模式开关，持久化到 localStorage。
 * 服务端渲染阶段返回默认值，挂载后再读取真实值，避免 hydration mismatch。
 */
export function useReaderTheme(): [ReaderTheme, (t: ReaderTheme) => void, () => void] {
  const [theme, setThemeState] = useState<ReaderTheme>(DEFAULT_THEME);

  // 挂载后从 localStorage 读
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "day" || stored === "night") {
        setThemeState(stored);
      }
    } catch {
      // localStorage 被禁用 → 用默认值
    }
  }, []);

  const setTheme = (t: ReaderTheme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  };

  const toggle = () => setTheme(theme === "day" ? "night" : "day");

  return [theme, setTheme, toggle];
}
