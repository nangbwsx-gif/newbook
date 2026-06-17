"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBookStore } from "@/store/useBookStore";
import { extractPageRange, extractPdfText } from "@/lib/extractPdfText";
import { showToast } from "@/lib/showToast";

/**
 * PdfDoc —— react-pdf 的 PDFDocumentProxy 的最小子集。
 * 直接 import "pdfjs-dist" 的类型会和 react-pdf 内捆绑的版本冲突，所以这里写一个结构类型。
 */
export interface PdfDoc {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{
      items: Array<{ str?: string }>;
    }>;
  }>;
}

interface AIChatPanelProps {
  open: boolean;
  onClose: () => void;
  pdfDoc: PdfDoc | null;
  bookTitle: string;
}

// AI SDK v6 通过 message.parts 暴露内容；这里给出一个最小类型
// （不导入 SDK 内部类型避免版本飘移）
interface MessagePart {
  type: string;
  text?: string;
  // tool-* 类型会带 input/output 等字段
  input?: { pageNumber?: number; exactText?: string; reason?: string };
  state?: string;
  toolName?: string;
  // AI SDK v6 给每次工具调用分配的唯一 id；用它做去重 key
  toolCallId?: string;
}

export function AIChatPanel({ open, onClose, pdfDoc, bookTitle }: AIChatPanelProps) {
  const { setCurrentPage, setHighlightKeyword, currentPage } = useBookStore();
  // 给页码做上界：AI 偶尔会幻觉出超出 PDF 页数的页码
  const numPages = pdfDoc?.numPages ?? 0;

  // ===== 按当前页提取附近文本（仅 5 页，大幅降低 token 消耗） =====
  const [pdfContext, setPdfContext] = useState("");
  const [extractInfo, setExtractInfo] = useState<{
    extracted: number;
    total: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);

  const doExtract = useCallback(async (pdf: PdfDoc, centerPage: number) => {
    const result = await extractPageRange(pdf, centerPage, 2);
    setPdfContext(result.combined);
    setExtractInfo({
      extracted: result.extractedPages,
      total: result.totalPages,
      rangeStart: Math.max(1, centerPage - 2),
      rangeEnd: Math.min(pdf.numPages, centerPage + 2),
    });
  }, []);

  useEffect(() => {
    if (!pdfDoc) {
      setPdfContext("");
      setExtractInfo(null);
      return;
    }
    let cancelled = false;
    doExtract(pdfDoc, currentPage);
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, doExtract]);

  // ===== useChat：transport 必须只创建一次，否则 useChat 不会换用新的 transport =====
  // 用 ref 持有最新的 pdfContext / bookTitle，prepareSendMessagesRequest 每次发请求时读 ref，
  // 这样不会受 React 闭包的旧值影响。
  const pdfContextRef = useRef(pdfContext);
  const bookTitleRef = useRef(bookTitle);
  const [summarizing, setSummarizing] = useState(false);
  // 总结模式：发送完整文本 + 标记，后端用总结提示词
  const summaryModeRef = useRef(false);

  useEffect(() => {
    pdfContextRef.current = pdfContext;
  }, [pdfContext]);
  useEffect(() => {
    bookTitleRef.current = bookTitle;
  }, [bookTitle]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // 每次请求都从 ref 拿最新 PDF 上下文
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages,
            pdfContext: pdfContextRef.current,
            bookTitle: bookTitleRef.current,
            isFullSummary: summaryModeRef.current,
            ...body,
          },
        }),
      }),
    [] // 空依赖：永远只创建一次
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  // ===== 监听工具调用 → 触发翻页 + 高亮 =====
  // 已处理过的工具调用 id，避免重复触发
  const handledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const parts = (msg.parts ?? []) as MessagePart[];
      parts.forEach((part, idx) => {
        // v6 中 tool 调用的 part.type 形如 "tool-navigateAndHighlight"
        if (
          part.type === "tool-navigateAndHighlight" &&
          (part.state === "input-available" || part.state === "output-available")
        ) {
          // 优先用 toolCallId，每次工具调用都唯一；
          // 退而求其次用 (msg.id, idx) —— 同一条消息里第几个 part 也是唯一的，
          // 比之前用 toolName 强（toolName 在多次调用时会重复）
          const id =
            part.toolCallId ?? `${msg.id}:${idx}:${part.toolName ?? part.type}`;
          if (handledRef.current.has(id)) return;
          handledRef.current.add(id);

          const { pageNumber, exactText } = part.input ?? {};
          if (typeof pageNumber === "number" && pageNumber >= 1) {
            // 客户端兜底页码上界，避免 AI 幻觉的超大页码污染 store/DB
            const safePage = numPages > 0 ? Math.min(pageNumber, numPages) : pageNumber;
            setCurrentPage(safePage);
          }
          if (typeof exactText === "string" && exactText.trim()) {
            setHighlightKeyword(exactText.trim());
          }
        }
      });
    }
  }, [messages, setCurrentPage, setHighlightKeyword, numPages]);

  // ===== 自动滚到底部 =====
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // ===== 输入框 =====
  const [input, setInput] = useState("");
  const isLoading = status === "submitted" || status === "streaming";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input.trim() });
    setInput("");
  }

  /** 总结全文：提取全部文本，以总结模式发送 */
  async function handleFullSummary() {
    if (!pdfDoc || summarizing) return;
    setSummarizing(true);
    try {
      const full = await extractPdfText(pdfDoc, 25, 150_000);
      // 临时替换上下文为全文
      pdfContextRef.current = full.combined;
      summaryModeRef.current = true;
      sendMessage({ text: "请用中文总结这本书的核心内容、主要观点和结构。" });
    } catch (err) {
      console.error("总结全文失败:", err);
      showToast("提取全文失败，请稍后重试", "error");
      setSummarizing(false);
    }
  }

  // 总结完成后，自动恢复普通模式
  const prevStatusRef = useRef(status);
  useEffect(() => {
    // 检测到 streaming 结束且是总结模式
    if (summaryModeRef.current && prevStatusRef.current === "streaming" && status === "ready") {
      summaryModeRef.current = false;
      setSummarizing(false);
      // 把上下文恢复为当前视口
      if (pdfDoc) {
        extractPageRange(pdfDoc, currentPage, 2).then((r) => {
          pdfContextRef.current = r.combined;
        });
      }
    }
    prevStatusRef.current = status;
  }, [status, pdfDoc, currentPage]);

  if (!open) return null;

  return (
    <aside
      className={[
        // 桌面：右侧固定 320 列宽，与 Document 并列
        "flex flex-col border-l border-white/10 bg-gray-900",
        "md:relative md:h-full md:w-80 md:shrink-0",
        // 移动：全屏覆盖
        "fixed inset-0 z-50 h-full w-full",
      ].join(" ")}
    >
      {/* 标题栏 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <span className="text-sm font-medium text-white">AI 阅读助手</span>
        </div>
        <button
          onClick={onClose}
          title="关闭"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* 消息区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="rounded-lg bg-white/5 p-3 text-xs text-gray-400">
            <p className="mb-2 font-medium text-gray-300">👋 你好，我能帮你：</p>
            <ul className="space-y-1 pl-3">
              <li>• 总结当前 PDF 的内容</li>
              <li>• 找到某段话的位置并跳转高亮</li>
              <li>• 解释难懂的概念</li>
            </ul>
            {!pdfContext && (
              <p className="mt-3 text-amber-400/80">
                ⏳ 正在读取 PDF 文本...
              </p>
            )}
            {pdfContext && extractInfo && (
              <p className="mt-3 text-emerald-400/80">
                ✅ 已读取第 {extractInfo.rangeStart}–{extractInfo.rangeEnd} 页
                （共 {extractInfo.total} 页），翻页后自动更新上下文
              </p>
            )}

            {/* 总结全文按钮：仅 25 页以内可用 */}
            {pdfContext && extractInfo && extractInfo.total <= 25 && !summarizing && (
              <button
                onClick={handleFullSummary}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/30"
              >
                <span>📋</span>
                <span>总结全文（共 {extractInfo.total} 页）</span>
              </button>
            )}
            {summarizing && (
              <p className="mt-3 text-amber-400/80">
                ⏳ 正在提取全文并生成总结...
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => {
            const parts = (msg.parts ?? []) as MessagePart[];
            const text = parts
              .filter((p) => p.type === "text")
              .map((p) => p.text ?? "")
              .join("");
            const toolCall = parts.find((p) =>
              p.type.startsWith("tool-navigateAndHighlight")
            );

            return (
              <div
                key={msg.id}
                className={
                  msg.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <div
                  className={[
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "bg-amber-400 text-amber-950"
                      : "bg-white/5 text-gray-100",
                  ].join(" ")}
                >
                  {text}
                  {toolCall && (
                    <div className="mt-2 flex items-center gap-1.5 rounded bg-yellow-300/20 px-2 py-1 text-xs text-yellow-200">
                      <span>📍</span>
                      <span>
                        已跳转到第 {toolCall.input?.pageNumber} 页并高亮
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-400">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500" />
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-300">
              出错了：{error.message}
            </div>
          )}
        </div>
      </div>

      {/* 输入区 */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-white/10 p-3"
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={pdfContext ? "问点什么..." : "等待 PDF 加载..."}
            disabled={!pdfContext || isLoading}
            className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-white/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || !pdfContext || isLoading}
            className="rounded-md bg-amber-400 px-3 py-2 text-sm font-medium text-amber-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </form>
    </aside>
  );
}
