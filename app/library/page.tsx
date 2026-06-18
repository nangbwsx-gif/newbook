"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { UploadDialog } from "@/components/UploadDialog";
import { RenameDialog } from "@/components/RenameDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  CategoryManagerDialog,
  type Category,
} from "@/components/CategoryManagerDialog";
import { MoveBookDialog } from "@/components/MoveBookDialog";
import { PageBackground } from "@/components/PageBackground";
import { ALL_TAB, UNCATEGORIZED, type CategoryTab } from "@/lib/categories";
import { showToast } from "@/lib/showToast";
import { useShare } from "@/lib/useShare";

// PDF 封面用客户端渲染，避免 SSR 加载 pdfjs 报错
const BookCover = dynamic(
  () => import("@/components/BookCover").then((m) => m.BookCover),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-100 via-orange-100 to-amber-200">
        <span className="text-3xl opacity-30">📖</span>
      </div>
    ),
  }
);

interface Book {
  id: string;
  title: string;
  fileUrl: string;
  createdAt: string;
  category: string;
  isPublic: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

  // 书名实时搜索（前端模糊过滤，大小写无关）
  const [query, setQuery] = useState("");
  // 分类 Tab 过滤
  const [activeCategory, setActiveCategory] = useState<CategoryTab>(ALL_TAB);

  // 主页所有过滤都在前端完成：先按分类，再按搜索词
  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      // 分类
      if (activeCategory !== ALL_TAB) {
        const bc = b.category || UNCATEGORIZED;
        if (bc !== activeCategory) return false;
      }
      // 搜索
      if (q && !b.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [books, query, activeCategory]);

  // 每个分类下书的数量（用于 Tab 上展示数字）
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of books) {
      const k = b.category || UNCATEGORIZED;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [books]);

  // 操作菜单状态
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // 重命名 / 删除弹窗
  const [renameTarget, setRenameTarget] = useState<Book | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 分类相关
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Book | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories ?? []);
      }
    } catch (err) {
      console.error("获取分类失败:", err);
    }
  }, []);

  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch("/api/books");
      if (res.ok) {
        const data = await res.json();
        setBooks(data.books);
      }
    } catch (err) {
      console.error("获取书橱失败:", err);
      showToast("获取书橱失败", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
    fetchCategories();
  }, [fetchBooks, fetchCategories]);

  // 点击卡片外部关闭菜单
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuOpenId && !(e.target as HTMLElement).closest("[data-menu]")) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [menuOpenId]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/books/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchBooks();
        showToast("已删除");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "删除失败", "error");
      }
    } catch (err) {
      console.error("删除失败:", err);
      showToast("网络错误", "error");
    } finally {
      setDeleting(false);
    }
  }

  // 分享 / 取消分享（统一抽取到 useShare hook）
  const { handleShare: shareBook, handleUnshare: unshareBook } = useShare({
    onBecamePublic: (id) =>
      setBooks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, isPublic: true } : b))
      ),
    onBecamePrivate: (id) =>
      setBooks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, isPublic: false } : b))
      ),
  });

  /** 菜单关闭 + 分享 */
  function handleShare(book: Book) {
    setMenuOpenId(null);
    shareBook(book);
  }

  function handleUnshare(book: Book) {
    setMenuOpenId(null);
    unshareBook(book);
  }

  async function handleLogout() {
    // httpOnly cookie 必须由服务端清除，document.cookie 删不动
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 即使网络失败也继续：本地态先清掉，避免卡住
    }
    logout();
    // 退出后回到首页（产品介绍页），而不是登录页
    window.location.href = "/";
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0b1424]">
      {/* ========== 深蓝氛围背景 ========== */}
      <PageBackground />

      {/* ========== 顶部导航栏 ========== */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#070e1c]/90 shadow-lg shadow-black/40 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <span className="text-xl">📖</span>
            <span className="font-serif tracking-wide">NewBook</span>
          </h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden max-w-[140px] truncate text-sm text-slate-400 sm:inline">
              👤 {user?.username}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 sm:px-3 sm:text-sm"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      {/* ========== 主内容区 ========== */}
      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {/* -------- 操作栏 -------- */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-bold text-slate-100">
              我的书橱
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {books.length > 0
                ? `共 ${books.length} 本书静静地等着你`
                : "上传你的第一本 PDF"}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* 搜索框：仅当书橱非空时显示 */}
            {books.length > 0 && (
              <div className="relative flex-1 sm:flex-initial">
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
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索书名…"
                  aria-label="搜索书名"
                  className="h-10 w-full rounded-md border border-white/10 bg-white/5 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-amber-400/50 focus:bg-white/10 sm:w-56"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="清除搜索"
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-white/10 hover:text-slate-200"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
            <Button
              size="lg"
              onClick={() => setUploadOpen(true)}
              className="shrink-0 bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/20 hover:bg-amber-300"
            >
              📤 上传 PDF
            </Button>
          </div>
        </div>

        {/* -------- 分类 Tabs：分类多时自动换行，避免横向溢出/挤压 -------- */}
        {!loading && books.length > 0 && (
          <div className="mb-6 flex items-start gap-2">
            <div className="flex flex-1 flex-wrap gap-2">
              <CategoryTabButton
                label="全部"
                count={books.length}
                active={activeCategory === ALL_TAB}
                onClick={() => setActiveCategory(ALL_TAB)}
              />
              {categories.map((c) => (
                <CategoryTabButton
                  key={c.id}
                  label={c.name}
                  count={counts.get(c.name) ?? 0}
                  active={activeCategory === c.name}
                  onClick={() => setActiveCategory(c.name)}
                />
              ))}
              {/* "未分类"作为兜底 Tab：始终显示，方便用户能看到那些落单的书 */}
              <CategoryTabButton
                label={UNCATEGORIZED}
                count={counts.get(UNCATEGORIZED) ?? 0}
                active={activeCategory === UNCATEGORIZED}
                onClick={() => setActiveCategory(UNCATEGORIZED)}
              />
            </div>
            {/* 齿轮：打开分类管理弹窗 */}
            <button
              onClick={() => setCategoryManagerOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-slate-100"
              title="管理分类"
              aria-label="管理分类"
            >
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        )}

        {/* -------- 加载中 -------- */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600/40 border-t-slate-200" />
            <span className="ml-3 text-sm text-slate-400">加载中...</span>
          </div>
        )}

        {/* -------- 空状态 -------- */}
        {!loading && books.length === 0 && (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-1 backdrop-blur-sm">
            <EmptyState
              icon="📚"
              title="书橱还是空的"
              description="上传你的第一本 PDF，开始建立属于你的在线书架。"
              action={
                <Button
                  size="lg"
                  onClick={() => setUploadOpen(true)}
                  className="bg-amber-400 text-slate-900 hover:bg-amber-300"
                >
                  📤 上传第一本书
                </Button>
              }
            />
          </div>
        )}

        {/* -------- 书橱网格（带木质隔板） -------- */}
        {!loading && books.length > 0 && filteredBooks.length === 0 && (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] py-12 text-center backdrop-blur-sm">
            <p className="text-3xl">🔍</p>
            <p className="mt-3 text-sm text-slate-300">
              {query ? (
                <>
                  没有找到与 <span className="text-amber-300">「{query}」</span> 匹配的书
                </>
              ) : (
                <>
                  分类 <span className="text-amber-300">「{activeCategory}」</span> 下还没有书
                </>
              )}
            </p>
            <button
              onClick={() => {
                setQuery("");
                setActiveCategory(ALL_TAB);
              }}
              className="mt-3 text-xs text-slate-400 underline underline-offset-4 hover:text-slate-200"
            >
              查看全部
            </button>
          </div>
        )}

        {!loading && filteredBooks.length > 0 && (
          <div className="space-y-12">
            {chunkArray(filteredBooks, 5).map((row, rowIndex) => (
              <div key={rowIndex} className="relative">
                {/* 一行书 */}
                <div className="grid grid-cols-2 gap-4 px-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {row.map((book) => (
                    <BookCard
                      key={book.id}
                      book={book}
                      menuOpenId={menuOpenId}
                      onMenuToggle={(id) =>
                        setMenuOpenId(menuOpenId === id ? null : id)
                      }
                      onRename={(b) => {
                        setMenuOpenId(null);
                        setRenameTarget(b);
                      }}
                      onDelete={(b) => {
                        setMenuOpenId(null);
                        setDeleteTarget(b);
                      }}
                      onShare={handleShare}
                      onUnshare={handleUnshare}
                      onMove={(b) => {
                        setMenuOpenId(null);
                        setMoveTarget(b);
                      }}
                      onRead={(b) => router.push(`/book/${b.id}`)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>

                {/* 木质隔板（深蓝背景下保留暖色木质对比） */}
                <div className="mt-4 h-3 rounded-sm bg-gradient-to-b from-[#5a3820] via-[#3d2817] to-[#1a0e07] shadow-[inset_0_2px_3px_rgba(0,0,0,0.7),0_6px_12px_rgba(0,0,0,0.5)]" />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ========== 底部 ========== */}
      <footer className="relative border-t border-white/5 bg-[#070e1c]/90 py-4 text-center text-xs text-slate-500 backdrop-blur-md">
        NewBook — 一个用于简历展示的在线 PDF 阅读器项目
      </footer>

      {/* ========== 弹窗们 ========== */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={fetchBooks}
        categories={categories}
      />
      <RenameDialog
        open={!!renameTarget}
        bookId={renameTarget?.id ?? ""}
        currentTitle={renameTarget?.title ?? ""}
        onClose={() => setRenameTarget(null)}
        onSuccess={fetchBooks}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除"
        message={`确定要删除《${deleteTarget?.title}》吗？此操作不可撤销。`}
        confirmLabel="确认删除"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
      />
      <CategoryManagerDialog
        open={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
        onChanged={() => {
          // 分类变更后：分类列表 + 书籍列表都可能受影响（删除会迁移书）
          fetchCategories();
          fetchBooks();
        }}
      />
      <MoveBookDialog
        open={!!moveTarget}
        bookId={moveTarget?.id ?? ""}
        bookTitle={moveTarget?.title ?? ""}
        currentCategory={moveTarget?.category ?? UNCATEGORIZED}
        categories={categories}
        onClose={() => setMoveTarget(null)}
        onSuccess={fetchBooks}
      />
    </div>
  );

  // ========== 工具：把数组按 N 分块（每行 5 本书） ==========
  function chunkArray<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
}

// ========== 单本书卡片（独立组件，便于复用） ==========
interface BookCardProps {
  book: Book;
  menuOpenId: string | null;
  onMenuToggle: (id: string) => void;
  onRename: (book: Book) => void;
  onDelete: (book: Book) => void;
  onShare: (book: Book) => void;
  onUnshare: (book: Book) => void;
  onMove: (book: Book) => void;
  onRead: (book: Book) => void;
  formatDate: (iso: string) => string;
}

function BookCard({
  book,
  menuOpenId,
  onMenuToggle,
  onRename,
  onDelete,
  onShare,
  onUnshare,
  onMove,
  onRead,
  formatDate,
}: BookCardProps) {
  return (
    <div className="group relative">
      {/* 卡片本体 */}
      <div
        className="relative flex cursor-pointer flex-col overflow-hidden rounded-md bg-amber-50 shadow-[0_6px_12px_rgba(0,0,0,0.5),0_2px_4px_rgba(0,0,0,0.3)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(0,0,0,0.6),0_4px_8px_rgba(0,0,0,0.4)]"
        onClick={() => onRead(book)}
      >
        {/* 书脊高光（左侧细线） */}
        <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-r from-black/30 to-transparent" />

        {/* PDF 封面 */}
        <div className="relative aspect-[3/4] overflow-hidden bg-amber-100">
          <BookCover fileUrl={book.fileUrl} title={book.title} />
          {/* 顶部柔和阴影 */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/15 to-transparent" />
          {/* 公开角标：绿点 + 文案，让用户一眼看见这本书已分享 */}
          {book.isPublic && (
            <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white shadow">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              公开
            </div>
          )}
          {/* 分类角标（非"未分类"才显示） */}
          {book.category && book.category !== UNCATEGORIZED && (
            <div className="pointer-events-none absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded bg-black/55 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
              {book.category}
            </div>
          )}
        </div>

        {/* 书籍信息 */}
        <div className="flex flex-col gap-1 border-t border-amber-200 bg-amber-50 p-2.5">
          <h3
            className="line-clamp-1 text-sm font-medium text-amber-950"
            title={book.title}
          >
            {book.title}
          </h3>
          <p className="text-xs text-amber-700/70">{formatDate(book.createdAt)}</p>
        </div>
      </div>

      {/* ⋮ 操作按钮 — 悬浮在卡片右上角，不影响整卡点击 */}
      <div className="absolute right-1.5 top-1.5 z-10" data-menu>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenuToggle(book.id);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-black/70 group-hover:opacity-100 max-md:opacity-100"
          title="更多操作"
        >
          ⋮
        </button>

        {menuOpenId === book.id && (
          <div
            className="absolute right-0 top-9 z-20 min-w-[130px] overflow-hidden rounded-md border border-amber-200 bg-white py-1 shadow-xl"
            data-menu
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-amber-950 hover:bg-amber-50"
              onClick={(e) => {
                e.stopPropagation();
                onShare(book);
              }}
            >
              {book.isPublic ? "🔗 复制分享链接" : "📤 生成分享链接"}
            </button>
            {book.isPublic && (
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-amber-950 hover:bg-amber-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnshare(book);
                }}
              >
                🔒 取消公开
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-amber-950 hover:bg-amber-50"
              onClick={(e) => {
                e.stopPropagation();
                onMove(book);
              }}
            >
              📁 移到分类
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-amber-950 hover:bg-amber-50"
              onClick={(e) => {
                e.stopPropagation();
                onRename(book);
              }}
            >
              ✏️ 重命名
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(book);
              }}
            >
              🗑️ 删除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 分类 Tab 按钮 ==========
function CategoryTabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-all",
        active
          ? "bg-amber-400 text-slate-900 shadow-sm shadow-amber-500/30"
          : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100",
      ].join(" ")}
    >
      <span>{label}</span>
      <span
        className={[
          "rounded-full px-1.5 text-[11px] tabular-nums",
          active ? "bg-slate-900/15 text-slate-900" : "bg-white/10 text-slate-400",
        ].join(" ")}
      >
        {count}
      </span>
    </button>
  );
}
