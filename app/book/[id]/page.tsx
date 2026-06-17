"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useBookStore } from "@/store/useBookStore";

// PDFReader 依赖浏览器 API（pdfjs worker / Canvas），禁用 SSR
const PDFReader = dynamic(
  () => import("@/components/PDFReader").then((m) => m.PDFReader),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-gray-200" />
          <span className="text-sm">阅读器加载中...</span>
        </div>
      </div>
    ),
  }
);

export default function BookPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const {
    currentBook,
    setCurrentBook,
    setPublicView,
    isPublicView,
    ownerUsername,
    reset,
  } = useBookStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchBook = useCallback(async () => {
    try {
      const bookRes = await fetch(`/api/books/${id}`);

      if (!bookRes.ok) {
        const data = await bookRes.json().catch(() => ({}));
        setError(data.error || "获取书籍失败");
        return;
      }

      const data = await bookRes.json();
      setCurrentBook(data.book);
      // 关键：根据接口返回的 isPublicView 决定 UI 是否进入"访客模式"
      setPublicView(!!data.isPublicView, data.ownerUsername ?? null);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [id, setCurrentBook, setPublicView]);

  useEffect(() => {
    fetchBook();
    return () => reset();
  }, [fetchBook, reset]);

  // 所有者：返回自己的书橱
  // 访客模式无返回按钮，此函数仅所有者场景使用
  function handleBack() {
    router.push("/library");
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900">
      {/* ========== 阅读页顶部栏 ========== */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-gray-900 px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {/* 访客模式：纯文字提示，没有任何可点击的导航按钮 */}
          {isPublicView ? (
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-amber-300 select-none">
              <span>📄</span>
              <span className="hidden sm:inline">PDF 预览模式</span>
            </span>
          ) : (
            <button
              onClick={handleBack}
              className="flex shrink-0 items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
              aria-label="返回书橱"
            >
              <BackIcon />
              <span className="hidden sm:inline">返回书橱</span>
            </button>
          )}

          {/* 分隔线 */}
          <div className="hidden h-4 w-px shrink-0 bg-white/20 sm:block" />
          <span className="truncate text-sm font-medium text-white">
            {currentBook?.title || "加载中..."}
          </span>

          {/* 访客模式：标识这是别人分享的书 */}
          {isPublicView && (
            <span className="ml-1 hidden shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300 sm:inline">
              {ownerUsername ? `${ownerUsername} 分享` : "公开分享"}
            </span>
          )}
        </div>
      </header>

      {/* ========== 内容区 ========== */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-3 text-gray-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-gray-200" />
              <span className="text-sm">加载中...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-gray-400">{error}</p>
              {!isPublicView && (
                <button
                  onClick={handleBack}
                  className="mt-4 text-sm text-blue-400 underline underline-offset-4 hover:text-blue-300"
                >
                  返回
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && !error && currentBook && <PDFReader />}
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
