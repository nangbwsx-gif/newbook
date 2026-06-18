"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Document, Outline, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useBookStore } from "@/store/useBookStore";
import { useDebouncedCallback } from "@/lib/useDebouncedCallback";
import { useReaderTheme } from "@/lib/useReaderTheme";
import { useIsMobile } from "@/lib/useIsMobile";
import { showToast } from "@/lib/showToast";
import { AIChatPanel, type PdfDoc } from "@/components/AIChatPanel";

// react-pdf 的 onLoadSuccess 回调类型推断
type DocumentProps = ComponentProps<typeof Document>;
type OnLoadSuccess = NonNullable<DocumentProps["onLoadSuccess"]>;

// ====== 配置 PDF.js Worker ======
// 从同源 public/ 加载 worker，避免 unpkg CDN 的 CORS 限制
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// HTML 转义，customTextRenderer 返回的字符串会作为 innerHTML 注入
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 把字符串转成"忽略空格/换行"的正则源码
// 例如 "abc def" → "a\\s*b\\s*c\\s*\\s*d\\s*e\\s*f"
function buildFuzzyRegex(keyword: string): RegExp | null {
  const cleaned = keyword.replace(/\s+/g, "");
  if (!cleaned) return null;
  const escaped = cleaned
    .split("")
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
  try {
    return new RegExp(escaped, "gi");
  } catch {
    return null;
  }
}

// ====== 工具栏按钮组件 ======
function ToolbarButton({
  onClick,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="reader-icon-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-300 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

export function PDFReader() {
  const {
    currentBook,
    currentPage,
    totalPages,
    scale,
    highlightKeyword,
    isPublicView,
    setCurrentPage,
    setTotalPages,
    setScale,
    setHighlightKeyword,
    patchCurrentBook,
  } = useBookStore();

  const [numPages, setNumPages] = useState(0);
  const [pageInput, setPageInput] = useState(String(currentPage));
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ====== 响应式 ======
  const isMobile = useIsMobile();
  // 测量阅读区可用宽度，给 PDF Page 用 width 属性自适应（避免移动端横向溢出）
  const [stageWidth, setStageWidth] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) {
        // 减去内边距，避免页面紧贴边框；最小 320，最大 1200（防止超大屏过度放大）
        const target = Math.max(320, Math.min(1200, Math.floor(w) - 32));
        setStageWidth(target);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ====== 日/夜模式 ======
  const [theme, , toggleTheme] = useReaderTheme();

  // 持有 pdf 实例 —— 给 AI 面板做文本提取用
  // 用 PdfDoc 类型别名（PDFDocumentProxy 子集），避免根级 pdfjs-dist 与 react-pdf 内捆绑版本类型冲突
  const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);

  // ====== 翻页动画 ======
  const [direction, setDirection] = useState<"forward" | "backward" | null>(null);
  const [animKey, setAnimKey] = useState(0);

  // ====== 侧边栏：默认桌面打开，移动端关闭 ======
  // 初始 false，挂载后根据屏宽决定；移动端无论何时都默认收起，避免开屏挤掉内容
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    if (!isMobile) setSidebarOpen(true);
    else setSidebarOpen(false);
  }, [isMobile]);

  // ====== AI 聊天面板开关 ======
  const [chatOpen, setChatOpen] = useState(false);

  // ====== 防抖保存阅读进度 ======
  // 仅在 Document 已加载（即用户开始翻页之后）才上报，避免初始化阶段就 PATCH
  const documentReadyRef = useRef(false);

  const saveProgress = useDebouncedCallback((bookId: string, page: number) => {
    fetch(`/api/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPage: page }),
    }).catch((err) => console.error("保存进度失败:", err));
  }, 1000);

  // 监听 currentPage 变化 → 防抖触发保存
  // 访客模式（公开链接）下不保存进度，避免给所有者写脏数据
  useEffect(() => {
    if (!documentReadyRef.current || !currentBook) return;
    if (isPublicView) return;
    saveProgress(currentBook.id, currentPage);
  }, [currentPage, currentBook, saveProgress, isPublicView]);

  // 加载成功回调 —— react-pdf 会把整个 PDFDocumentProxy 作为参数传入
  const handleLoadSuccess: OnLoadSuccess = useCallback(
    (pdf) => {
      setNumPages(pdf.numPages);
      setTotalPages(pdf.numPages);
      // pdf 来自 react-pdf 内嵌的 pdfjs-dist 版本；用结构类型 PdfDoc 转换以避免和根级 pdfjs-dist 类型冲突
      setPdfDoc(pdf as unknown as PdfDoc);
      // 标记已加载 —— 之后才允许触发进度保存
      documentReadyRef.current = true;
    },
    [setTotalPages]
  );

  // 同步外部 currentPage → 输入框
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // AI 跳转 + 高亮后，自动把第一个 <mark> 滚到视口中央。
  // 不这样的话，目标段落经常落在视口外，用户得自己手动找；做完跳转就完整了。
  // 用 setTimeout + 重试是因为 react-pdf 的 textContent 是异步渲染的，
  // 第一次 useEffect 触发时 mark 元素可能还没出现。
  useEffect(() => {
    if (!highlightKeyword) return;
    let cancelled = false;
    let tries = 0;
    const maxTries = 12; // ~1.2s（每次 100ms）

    const tick = () => {
      if (cancelled) return;
      const stage = stageRef.current;
      const mark = stage?.querySelector<HTMLElement>(
        ".react-pdf__Page__textContent mark"
      );
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      tries++;
      if (tries < maxTries) window.setTimeout(tick, 100);
    };
    // 等翻页动画 + 文本层渲染先开始
    const id = window.setTimeout(tick, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [highlightKeyword, currentPage]);

  // ====== 翻页（带方向追踪） ======
  function goToPage(page: number) {
    if (page < 1 || page > numPages) return;
    if (page === currentPage) return;
    setDirection(page > currentPage ? "forward" : "backward");
    setAnimKey((k) => k + 1);
    setCurrentPage(page);
  }

  // ====== 分享 ======
  // 与主页 BookCard 的 handleShare 行为一致：幂等开公开 → 复制 URL → toast
  async function handleShare() {
    if (!currentBook) return;
    const wasAlreadyPublic = !!currentBook.isPublic;
    try {
      if (!wasAlreadyPublic) {
        const res = await fetch(`/api/books/${currentBook.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: true }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showToast(data.error || "开启公开访问失败", "error");
          return;
        }
        patchCurrentBook({ isPublic: true });
      }
      const url = `${window.location.origin}/book/${currentBook.id}`;
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
      const url = `${window.location.origin}/book/${currentBook.id}`;
      showToast(`手动复制链接：${url}`, "info", 6000);
    }
  }

  /** 取消公开 —— 取消后老链接立刻失效 */
  async function handleUnshare() {
    if (!currentBook?.isPublic) return;
    try {
      const res = await fetch(`/api/books/${currentBook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "取消公开失败", "error");
        return;
      }
      patchCurrentBook({ isPublic: false });
      showToast("🔒 已取消公开，原分享链接失效");
    } catch (err) {
      console.error("取消公开失败:", err);
      showToast("网络错误", "error");
    }
  }

  function goToPrevPage() {
    goToPage(currentPage - 1);
  }

  function goToNextPage() {
    goToPage(currentPage + 1);
  }

  // 跳转输入框
  function handlePageInputSubmit() {
    const page = parseInt(pageInput, 10);
    if (isNaN(page)) {
      setPageInput(String(currentPage));
      return;
    }
    goToPage(page);
  }

  function handlePageInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handlePageInputSubmit();
    if (e.key === "Escape") setPageInput(String(currentPage));
  }

  // 缩放
  function zoomIn() {
    setScale(Math.min(scale + 0.25, 3.0));
  }

  function zoomOut() {
    setScale(Math.max(scale - 0.25, 0.5));
  }

  // 键盘快捷键
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          goToPrevPage();
          break;
        case "ArrowRight":
          goToNextPage();
          break;
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
          zoomOut();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // ====== Outline 点击：跳转到指定页 ======
  // react-pdf 的 onItemClick 会传 { pageNumber, pageIndex, dest } —— 优先用 pageNumber
  function handleOutlineItemClick({
    pageNumber,
  }: {
    pageNumber: number | string;
  }) {
    const page = typeof pageNumber === "string" ? parseInt(pageNumber, 10) : pageNumber;
    if (Number.isInteger(page)) goToPage(page);
  }

  // ====== 自定义文本渲染：AI 高亮关键词 ======
  // PDF.js 把页面文字按字形位置切成很多极小的 item，
  // 中文 "参考文献 [1] 张伟" 可能被切成 ["参考","文","献","[1","] ","张伟"] 这么碎。
  //
  // 三层匹配策略：
  //   1) item 内有完整命中（用模糊正则忽略空白）→ 精确高亮命中部分
  //   2) item 是关键词的"子串碎片"，且碎片长度 ≥ 阈值 → 整体高亮
  //   3) 其余情况 → 不高亮
  //
  // 碎片阈值策略：
  //   下限 2，上限 4，等于 keyword 长度的 1/4（取整）。
  //   8字keyword → 阈值=2；16字keyword → 阈值=4；20字keyword → 阈值=5→截断到4。
  //   这样"文""献""1"这种 1 字 item 不会被高亮（它们是高误伤率的主要原因），
  //   但"参考""张伟"等 2 字碎片仍然能命中。
  const customTextRenderer = useMemo(() => {
    if (!highlightKeyword) return undefined;

    const regex = buildFuzzyRegex(highlightKeyword);
    const normKeyword = highlightKeyword.replace(/\s+/g, "").toLowerCase();
    if (!normKeyword) return undefined;

    const minLen = Math.max(2, Math.min(4, Math.ceil(normKeyword.length / 4)));

    return ({ str }: { str: string }) => {
      if (!str) return "";

      // ---- 第 1 步：item 内完整命中 ----
      if (regex) {
        let result = "";
        let lastIndex = 0;
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        let hit = false;
        while ((m = regex.exec(str)) !== null) {
          hit = true;
          if (m.index > lastIndex) {
            result += escapeHtml(str.slice(lastIndex, m.index));
          }
          result += `<mark>${escapeHtml(m[0])}</mark>`;
          lastIndex = m.index + m[0].length;
          if (m[0].length === 0) regex.lastIndex++;
        }
        if (hit) {
          if (lastIndex < str.length) result += escapeHtml(str.slice(lastIndex));
          return result;
        }
      }

      // ---- 第 2 步：碎片匹配 —— 只有 ≥ minLen 的 item 才高亮 ----
      const normStr = str.replace(/\s+/g, "").toLowerCase();
      if (normStr.length >= minLen && normKeyword.includes(normStr)) {
        return `<mark>${escapeHtml(str)}</mark>`;
      }

      // ---- 第 3 步：默认不高亮 ----
      return escapeHtml(str);
    };
  }, [highlightKeyword]);

  if (!currentBook) return null;

  return (
    <div
      data-reader-theme={theme}
      className="reader-shell flex h-full flex-col bg-gray-900"
    >
      {/* ========== 顶部工具栏 ==========
          移动端按钮多挤一行可能溢出，给容器加 overflow-x-auto 允许横向滚动 */}
      {/* 访客模式提示条 */}
      {isPublicView && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-amber-50/10 border-b border-amber-400/20 px-4 py-1.5 text-xs text-amber-300/80 select-none">
          <span>🔓</span>
          <span>PDF 预览模式 — 你正在阅读公开分享的文档</span>
        </div>
      )}
      <div className="reader-toolbar flex h-12 shrink-0 items-center justify-start gap-1 overflow-x-auto border-b border-white/10 bg-gray-900 px-2 sm:justify-center sm:px-4 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 侧边栏开关 */}
        <ToolbarButton
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? "隐藏目录" : "显示目录"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="14" y2="12" />
            <line x1="4" y1="18" x2="18" y2="18" />
          </svg>
        </ToolbarButton>

        <div className="reader-divider mx-1 h-5 w-px bg-white/20" />

        {/* 上一页 */}
        <ToolbarButton
          onClick={goToPrevPage}
          disabled={currentPage <= 1}
          title="上一页 (←)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </ToolbarButton>

        {/* 页码显示 */}
        <div className="flex items-center gap-1 mx-2">
          <input
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={handlePageInputSubmit}
            onKeyDown={handlePageInputKeyDown}
            className="reader-page-input h-8 w-10 rounded border border-white/20 bg-white/5 text-center text-sm text-white outline-none focus:border-white/50 focus:bg-white/10"
          />
          <span className="reader-text-muted text-sm text-gray-400">/ {numPages || "?"}</span>
        </div>

        {/* 下一页 */}
        <ToolbarButton
          onClick={goToNextPage}
          disabled={currentPage >= numPages}
          title="下一页 (→)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </ToolbarButton>

        {/* 分隔线 */}
        <div className="reader-divider mx-2 h-5 w-px bg-white/20" />

        {/* 缩小 */}
        <ToolbarButton onClick={zoomOut} disabled={scale <= 0.5} title="缩小 (-)">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path d="M8 11h6" />
          </svg>
        </ToolbarButton>

        {/* 缩放比例 */}
        <span className="reader-text-muted mx-1 text-xs text-gray-400 w-10 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>

        {/* 放大 */}
        <ToolbarButton onClick={zoomIn} disabled={scale >= 3.0} title="放大 (+)">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path d="M11 8v6" />
            <path d="M8 11h6" />
          </svg>
        </ToolbarButton>

        {/* 分隔线 */}
        <div className="reader-divider mx-2 h-5 w-px bg-white/20" />

        {/* 分享按钮：开启公开访问并复制链接 —— 访客模式不可见 */}
        {!isPublicView && (
          <ToolbarButton
            onClick={handleShare}
            title={currentBook?.isPublic ? "复制分享链接（已公开）" : "生成分享链接"}
          >
            {/* share/link 图标；公开状态下加一抹绿色提示已分享 */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={currentBook?.isPublic ? "#34d399" : "currentColor"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </ToolbarButton>
        )}

        {/* 已公开标签：所有者本人才可见，点 ✕ 取消公开 */}
        {!isPublicView && currentBook?.isPublic && (
          <button
            onClick={handleUnshare}
            title="取消公开"
            className="ml-1 flex h-9 shrink-0 items-center gap-1 rounded-md bg-emerald-500/15 px-2 text-xs text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-200"
          >
            <span className="hidden sm:inline">已公开</span>
            <span>✕</span>
          </button>
        )}

        {/* 日/夜模式切换 */}
        <ToolbarButton
          onClick={toggleTheme}
          title={theme === "night" ? "切换到日间模式" : "切换到夜间模式"}
        >
          {theme === "night" ? (
            // 当前是夜间 → 显示太阳图标（点击切到日间）
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
          ) : (
            // 当前是日间 → 显示月亮图标（点击切到夜间）
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          )}
        </ToolbarButton>

        {/* AI 助手开关 —— 访客模式下不允许使用，避免消耗所有者的 AI 额度 */}
        {!isPublicView && (
          <button
            onClick={() => setChatOpen((v) => !v)}
            title={chatOpen ? "关闭 AI 助手" : "打开 AI 助手"}
            className={[
              "flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-all sm:px-3",
              chatOpen
                ? "bg-amber-400 text-amber-950 hover:bg-amber-300"
                : "bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            <span>🤖</span>
            <span className="hidden sm:inline">AI 助手</span>
          </button>
        )}

        {/* 高亮关键词存在时显示"清除高亮"按钮 */}
        {highlightKeyword && (
          <button
            onClick={() => setHighlightKeyword(null)}
            title="清除高亮"
            className="reader-clear-highlight ml-2 flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors"
          >
            <span className="hidden sm:inline">清除高亮</span>
            <span>✕</span>
          </button>
        )}
      </div>

      {/* ========== 主体：侧边栏 + 阅读区 ========== */}
      <div className="flex flex-1 overflow-hidden">
        <Document
          file={currentBook.fileUrl}
          onLoadSuccess={handleLoadSuccess}
          loading={
            <div className="flex flex-1 items-center justify-center text-gray-400">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-gray-200" />
                <span className="text-sm">加载 PDF 中...</span>
              </div>
            </div>
          }
          error={
            <div className="flex flex-1 items-center justify-center py-20 text-center text-gray-400">
              <div>
                <p className="text-lg">😵 PDF 加载失败</p>
                <p className="mt-2 text-sm">请检查文件是否损坏或已删除</p>
              </div>
            </div>
          }
          noData={
            <div className="flex flex-1 items-center justify-center py-20 text-center text-gray-400">
              <p className="text-lg">📭 无 PDF 数据</p>
            </div>
          }
          // Document 必须包裹 Outline 和 Page —— react-pdf 通过 context 传递文档实例
          className="relative flex w-full"
        >
          {/* -------- 左侧目录侧边栏 --------
              桌面：内联宽度 0/256 挤压式过渡
              移动：抽屉式（绝对定位覆盖在 stage 上方），并由遮罩点击关闭 */}
          {isMobile && sidebarOpen && (
            <div
              className="absolute inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          <aside
            className={[
              "reader-sidebar overflow-hidden border-r border-white/10 bg-gray-900/95 backdrop-blur-sm transition-all duration-300 ease-in-out",
              // 桌面：参与流式布局（挤压式）
              "md:relative md:shrink-0",
              sidebarOpen ? "md:w-64" : "md:w-0",
              // 移动：抽屉式覆盖
              "absolute inset-y-0 left-0 z-40",
              sidebarOpen ? "w-72 max-w-[80vw]" : "w-0",
            ].join(" ")}
          >
            <div className="h-full w-72 max-w-[80vw] overflow-y-auto p-4 md:w-64 md:max-w-none">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  目录
                </h3>
                {/* 移动端抽屉里给个关闭按钮，方便单手操作 */}
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-white md:hidden"
                  aria-label="关闭目录"
                >
                  ✕
                </button>
              </div>
              {/* react-pdf 的 Outline；自动从 PDF 提取大纲；点击项调跳转 */}
              <div className="pdf-outline text-sm text-gray-300">
                <Outline
                  onItemClick={(args) => {
                    handleOutlineItemClick(args);
                    // 移动端点目录后自动收起抽屉
                    if (isMobile) setSidebarOpen(false);
                  }}
                  className="space-y-1"
                />
              </div>
              {/* PDF 没有 outline 时 react-pdf 渲染空内容；手动放个占位提示 */}
              <p className="pdf-outline-empty mt-2 text-xs text-gray-600">
                如未显示目录，说明此 PDF 没有内嵌大纲信息
              </p>
            </div>
          </aside>

          {/* -------- 右侧 PDF 渲染区（带翻页热区 + 动画） -------- */}
          <div
            ref={(node) => {
              containerRef.current = node;
              stageRef.current = node;
            }}
            className="reader-stage book-stage relative flex-1 overflow-auto bg-gray-800"
          >
            <div className="flex justify-center py-4 sm:py-8">
              <div className="relative">
                {/* 左侧大点击区 —— 移动端隐藏，避免挤压页面 + 误触 */}
                <button
                  type="button"
                  onClick={goToPrevPage}
                  disabled={currentPage <= 1}
                  aria-label="上一页"
                  title="上一页 (←)"
                  className="group absolute right-full top-0 z-20 hidden h-full w-20 cursor-pointer items-center justify-center transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:hover:bg-transparent md:flex"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white opacity-60 shadow-lg backdrop-blur-md transition-all group-hover:bg-white/20 group-hover:opacity-100 group-hover:scale-110 group-active:scale-95 group-disabled:opacity-15">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </span>
                </button>

                {/* 右侧大点击区 —— 移动端隐藏 */}
                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={currentPage >= numPages}
                  aria-label="下一页"
                  title="下一页 (→)"
                  className="group absolute left-full top-0 z-20 hidden h-full w-20 cursor-pointer items-center justify-center transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:hover:bg-transparent md:flex"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white opacity-60 shadow-lg backdrop-blur-md transition-all group-hover:bg-white/20 group-hover:opacity-100 group-hover:scale-110 group-active:scale-95 group-disabled:opacity-15">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                </button>

                {/* 包裹层使用 animKey 作为 key —— 每次翻页强制重挂载触发 CSS 动画 */}
                <div
                  key={animKey}
                  className={
                    direction === "forward"
                      ? "page-flip-forward"
                      : direction === "backward"
                      ? "page-flip-backward"
                      : ""
                  }
                >
                  <Page
                    pageNumber={currentPage}
                    // 移动端用 width 自适应容器（避免横向滚动），桌面端保留 scale 缩放
                    {...(isMobile && stageWidth
                      ? { width: stageWidth }
                      : { scale })}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    customTextRenderer={customTextRenderer}
                    className="shadow-2xl"
                    loading={
                      <div className="flex h-[60vh] min-h-[400px] w-full max-w-[600px] items-center justify-center rounded-lg bg-white/5">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-500 border-t-gray-200" />
                      </div>
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </Document>

        {/* ========== 右侧 AI 聊天面板（与 Document 同级） ========== */}
        <AIChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          pdfDoc={pdfDoc}
          bookTitle={currentBook.title}
        />
      </div>
    </div>
  );
}
