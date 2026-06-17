import type { PdfDoc } from "@/components/AIChatPanel";

interface PageText {
  pageNumber: number;
  text: string;
}

export interface ExtractResult {
  pages: PageText[];
  combined: string;
  truncated: boolean;
  totalPages: number;
  extractedPages: number;
}

/**
 * 按页码范围提取 PDF 文本（含两端）。
 *
 * 这是替代 extractPdfText 的新函数 —— 不再提取全文，
 * 只提取当前阅读页附近的内容，大幅减少 token 消耗和 AI 幻觉。
 *
 * @param pdf       PDFDocumentProxy 实例
 * @param center   当前阅读页码（1-based）
 * @param radius   前后各取多少页（默认 2，即共 5 页）
 * @param maxChars 单页文本上限，防止单页超长 PDF 撑爆（默认 1 万字符）
 */
export async function extractPageRange(
  pdf: PdfDoc,
  center: number,
  radius = 2,
  maxCharsPerPage = 10_000
): Promise<ExtractResult> {
  const pages: PageText[] = [];
  const total = pdf.numPages;
  const start = Math.max(1, center - radius);
  const end = Math.min(total, center + radius);
  let truncated = false;

  for (let i = start; i <= end; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      // 单页截断
      if (text.length > maxCharsPerPage) {
        text = text.slice(0, maxCharsPerPage) + "…（本页较长已截断）";
        truncated = true;
      }

      pages.push({ pageNumber: i, text });
    } catch (err) {
      console.warn(`抽取第 ${i} 页文本失败:`, err);
    }
  }

  // 拼接成带页码标记的整体文本
  const combined = pages
    .map((p) => `[第 ${p.pageNumber} 页]\n${p.text}`)
    .join("\n\n");

  return {
    pages,
    combined,
    truncated,
    totalPages: total,
    extractedPages: pages.length,
  };
}

/**
 * 旧版全文提取（已废弃，保留仅做向后兼容引用）。
 * 新代码请用 extractPageRange。
 */
export async function extractPdfText(
  pdf: PdfDoc,
  maxPages: number = Infinity,
  maxChars = 150_000
): Promise<ExtractResult> {
  const pages: PageText[] = [];
  const total = Math.min(pdf.numPages, maxPages);
  let charCount = 0;
  let truncated = false;

  for (let i = 1; i <= total; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (charCount + text.length > maxChars) {
        const remaining = maxChars - charCount;
        if (remaining > 0) {
          pages.push({ pageNumber: i, text: text.slice(0, remaining) });
        }
        truncated = true;
        break;
      }

      pages.push({ pageNumber: i, text });
      charCount += text.length;
    } catch (err) {
      console.warn(`抽取第 ${i} 页文本失败:`, err);
    }
  }

  const combined = pages
    .map((p) => `[第 ${p.pageNumber} 页]\n${p.text}`)
    .join("\n\n");

  return {
    pages,
    combined,
    truncated,
    totalPages: pdf.numPages,
    extractedPages: pages.length,
  };
}
