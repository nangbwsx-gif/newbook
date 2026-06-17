"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ====== 类型定义 ======
type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

// ====== 全局事件通道 ======
// 让 showToast() 从任何地方（包括非 React 上下文）都能触发弹窗
const TOAST_EVENT = "__toast-popup";

declare global {
  interface Window {
    __dispatchToast?: (msg: string, kind: ToastKind, duration: number) => void;
  }
}

/** 全局可调用的弹窗函数 */
export function showPopupToast(
  message: string,
  kind: ToastKind = "success",
  duration = 3000
) {
  if (typeof window === "undefined") return;
  window.__dispatchToast?.(message, kind, duration);
}

// ====== 图标映射 ======
const ICONS: Record<ToastKind, string> = {
  success: "✅",
  error: "❌",
  info: "ℹ️",
};

const TITLES: Record<ToastKind, string> = {
  success: "成功",
  error: "失败",
  info: "提示",
};

const BORDER_COLORS: Record<ToastKind, string> = {
  success: "border-emerald-400",
  error: "border-red-400",
  info: "border-slate-400",
};

// ====== Toast Provider ======
let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, kind: ToastKind, duration: number) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, kind }]);
      const timer = setTimeout(() => removeToast(id), duration);
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  // 注册全局分发器
  useEffect(() => {
    window.__dispatchToast = addToast;
    return () => {
      window.__dispatchToast = undefined;
    };
  }, [addToast]);

  // 清理所有定时器
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  return (
    <>
      {children}

      {/* ====== Toast 弹窗层 ====== */}
      <div
        className="pointer-events-none fixed inset-0 z-[9999] flex flex-col items-center justify-start pt-[15vh] sm:pt-[20vh]"
        aria-live="polite"
      >
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            className={[
              "pointer-events-auto mx-4 mb-3 w-full max-w-sm animate-in rounded-xl border-2 bg-white p-4 shadow-2xl dark:bg-slate-900",
              BORDER_COLORS[toast.kind],
            ].join(" ")}
            style={{
              animation: "toastSlideIn 0.25s ease-out",
            }}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-xl leading-none">{ICONS[toast.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {TITLES[toast.kind]}
                </p>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                  {toast.message}
                </p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 动画关键帧 */}
      <style jsx global>{`
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateY(-12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  );
}
