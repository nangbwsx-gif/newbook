"use client";

import { showToast } from "@/lib/showToast";

/**
 * 通用的图书公开分享 / 取消分享逻辑 hook。
 *
 * 原先在 app/library/page.tsx（BookCard handleShare/handleUnshare）
 * 和 components/PDFReader.tsx（handleShare/handleUnshare）中
 * 各有一份 ~50 行几乎完全相同的实现，这里统一抽取。
 */

interface ShareableBook {
  id: string;
  /** undefined 视为 false（未公开） */
  isPublic?: boolean;
}

interface UseShareOptions {
  /** 开启公开后同步更新本地状态 */
  onBecamePublic: (id: string) => void;
  /** 取消公开后同步更新本地状态 */
  onBecamePrivate: (id: string) => void;
}

export function useShare({ onBecamePublic, onBecamePrivate }: UseShareOptions) {
  /**
   * 开启公开分享：幂等（已公开的只复制链接），复制阅读器 URL 到剪贴板。
   */
  async function handleShare(book: ShareableBook) {
    const wasAlreadyPublic = book.isPublic;
    try {
      if (!wasAlreadyPublic) {
        const res = await fetch(`/api/books/${book.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: true }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showToast(data.error || "开启公开访问失败", "error");
          return;
        }
        onBecamePublic(book.id);
      }

      const url = `${window.location.origin}/book/${book.id}`;
      // clipboard.writeText 在 HTTP 下会被浏览器阻止，尝试传统方式兜底
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const input = document.createElement("input");
        input.value = url;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }

      showToast(
        wasAlreadyPublic
          ? "🔗 链接已复制到剪贴板"
          : "✅ 已开启公开访问，链接已复制到剪贴板！"
      );
    } catch (err) {
      console.error("分享失败:", err);
      const url = `${window.location.origin}/book/${book.id}`;
      showToast(`手动复制链接：${url}`, "info", 6000);
    }
  }

  /**
   * 取消公开分享：取消后老链接立刻失效。
   */
  async function handleUnshare(book: ShareableBook) {
    if (!book.isPublic) return;
    try {
      const res = await fetch(`/api/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "取消公开失败", "error");
        return;
      }
      onBecamePrivate(book.id);
      showToast("🔒 已取消公开，原分享链接失效");
    } catch (err) {
      console.error("取消公开失败:", err);
      showToast("网络错误", "error");
    }
  }

  return { handleShare, handleUnshare };
}
