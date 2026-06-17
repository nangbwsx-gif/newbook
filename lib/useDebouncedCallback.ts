import { useCallback, useEffect, useRef } from "react";

/**
 * useDebouncedCallback — lodash.debounce 的零依赖小替代。
 *
 * 返回一个「防抖版」的回调：连续调用只会在最后一次调用 delay ms 之后真正执行。
 * 跨渲染保留同一个定时器与最新的 callback 引用。
 * **返回的函数引用是稳定的**（useCallback + 空依赖），可以放进 useEffect 的依赖数组而不会触发重跑。
 * 组件卸载时自动清理 pending 的定时器，避免在已卸载组件上触发副作用。
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  // 始终持有"最新"的回调与 delay，避免闭包陷阱
  const callbackRef = useRef(callback);
  const delayRef = useRef(delay);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    delayRef.current = delay;
  }, [delay]);

  // 卸载时清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 关键：useCallback + 空依赖，保证返回值在组件生命周期内**引用恒定**。
  // 这样调用方把它放进 useEffect 依赖里也不会因为父组件 re-render 而重跑 effect。
  return useCallback((...args: Args) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delayRef.current);
  }, []);
}
