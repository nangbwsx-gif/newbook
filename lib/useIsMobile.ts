import { useEffect, useState } from "react";

/**
 * 通过 window.matchMedia 监听断点变化。
 * 默认断点 768px（Tailwind 的 md），<768 视为移动端。
 *
 * SSR 安全：第一次渲染返回 false（视为桌面），挂载后才读真实值，
 * 避免 hydration mismatch。
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    // Safari < 14 用 addListener，新版用 addEventListener；都兼容
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [breakpoint]);

  return isMobile;
}
