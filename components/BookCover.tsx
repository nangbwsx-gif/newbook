"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// 复用 PDFReader 同款 worker（同源静态资源，避免 CORS）
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface BookCoverProps {
  fileUrl: string;
  title: string;
}

/** 模块级缓存：fileUrl → 图片 data URL，页面刷新前一直有效 */
const coverCache = new Map<string, string>();

/** PDF 加载失败 / 还在下载时的占位封面 — 用书名当 "纸质封面" */
function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-amber-100 via-orange-100 to-amber-200 p-4">
      <span className="text-3xl opacity-40">📖</span>
      <p className="line-clamp-4 text-center text-sm font-serif leading-snug text-amber-900/80">
        {title}
      </p>
    </div>
  );
}

export function BookCover({ fileUrl, title }: BookCoverProps) {
  const [errored, setErrored] = useState(false);
  const [cachedUrl, setCachedUrl] = useState<string | null>(() =>
    coverCache.get(fileUrl) ?? null
  );
  const pageRef = useRef<any>(null);

  // 首次渲染成功时把 canvas 转成图片缓存起来
  const handleRenderSuccess = useCallback((page: any) => {
    pageRef.current = page;
    // 防止重复缓存同一个 URL
    if (coverCache.has(fileUrl)) return;
    try {
      const canvas = page.canvas as HTMLCanvasElement;
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        coverCache.set(fileUrl, url);
        setCachedUrl(url);
      });
    } catch {
      // 静默失败，下次还会尝试渲染 PDF
    }
  }, [fileUrl]);

  // 组件卸载时把当前渲染结果也缓存（给 future 挂载用）
  useEffect(() => {
    return () => {
      if (pageRef.current && !coverCache.has(fileUrl)) {
        try {
          const canvas = pageRef.current.canvas as HTMLCanvasElement;
          if (!canvas) return;
          canvas.toBlob((blob) => {
            if (!blob || coverCache.has(fileUrl)) return;
            const url = URL.createObjectURL(blob);
            coverCache.set(fileUrl, url);
          });
        } catch {
          // 静默
        }
      }
    };
  }, [fileUrl]);

  if (cachedUrl) {
    return (
      <img
        src={cachedUrl}
        alt={title}
        className="h-full w-full object-contain"
      />
    );
  }

  if (errored) return <Placeholder title={title} />;

  return (
    <Document
      file={fileUrl}
      loading={<Placeholder title={title} />}
      error={<Placeholder title={title} />}
      noData={<Placeholder title={title} />}
      onLoadError={() => setErrored(true)}
      className="flex h-full w-full items-center justify-center [&>canvas]:!h-auto [&>canvas]:!max-w-full"
    >
      <Page
        pageNumber={1}
        width={240}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={<Placeholder title={title} />}
        error={<Placeholder title={title} />}
        onRenderSuccess={handleRenderSuccess}
        className="[&>canvas]:!h-auto [&>canvas]:!w-full"
      />
    </Document>
  );
}
