"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// 复用 PDFReader 同款 worker（同源静态资源，避免 CORS）
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface BookCoverProps {
  fileUrl: string;
  title: string;
}

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
        className="[&>canvas]:!h-auto [&>canvas]:!w-full"
      />
    </Document>
  );
}
