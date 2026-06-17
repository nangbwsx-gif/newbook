"use client";

/**
 * Toast 弹窗。
 *
 * 底层由 components/Toast.tsx 的 ToastProvider 渲染，
 * 通过 window.__dispatchToast 全局函数触发。
 * 调用方无需关心实现 —— 只需 import { showToast } from "@/lib/showToast" 即可。
 */

type ToastKind = "success" | "error" | "info";

/** 全局弹窗。需确保 ToastProvider 已挂载（见 app/providers.tsx）。 */
export function showToast(
  message: string,
  kind: ToastKind = "success",
  duration = 3000
) {
  if (typeof window === "undefined") return;
  window.__dispatchToast?.(message, kind, duration);
}
