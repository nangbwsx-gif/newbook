"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { showToast } from "@/lib/showToast";
import { UNCATEGORIZED } from "@/lib/categories";
import type { Category } from "./CategoryManagerDialog";

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** 用户的分类列表（来自主页） */
  categories: Category[];
}

type Phase = "idle" | "uploading" | "processing";

export function UploadDialog({ open, onClose, onSuccess, categories }: UploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>(UNCATEGORIZED);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0); // 0-100
  const [error, setError] = useState("");

  const isBusy = phase !== "idle";

  // 弹窗关闭时清空残留状态，避免下次打开仍显示上次选的文件
  useEffect(() => {
    if (!open) {
      // 关闭时如果还在上传，主动 abort，避免泄漏请求
      xhrRef.current?.abort();
      xhrRef.current = null;
      setSelectedFile(null);
      // 重置默认分类：优先选第一个用户分类，没有时回落到「未分类」
      setCategory(categories[0]?.name ?? UNCATEGORIZED);
      setPhase("idle");
      setProgress(0);
      setError("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open, categories]);

  if (!open) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError("");
  }

  function handleUpload() {
    if (!selectedFile) {
      setError("请先选择文件");
      return;
    }

    setPhase("uploading");
    setProgress(0);
    setError("");

    // 用 XHR 而不是 fetch —— 只有 XHR 暴露 upload.onprogress 事件，
    // fetch API 至今没有原生的上传进度回调。
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.open("POST", "/api/books");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setProgress(pct);
        // 字节传完后服务器还要写盘 + 写库 + 解析；进入"处理中"伪进度
        if (pct >= 100) setPhase("processing");
      }
    });

    xhr.addEventListener("load", () => {
      xhrRef.current = null;
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* ignore */
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        setPhase("idle");
        setProgress(0);
        onSuccess();
        onClose();
        setSelectedFile(null);
        showToast("✅ 上传成功");
      } else {
        setPhase("idle");
        setProgress(0);
        setError(data.error || `上传失败 (${xhr.status})`);
      }
    });

    xhr.addEventListener("error", () => {
      xhrRef.current = null;
      setPhase("idle");
      setProgress(0);
      setError("网络错误，请重试");
    });

    xhr.addEventListener("abort", () => {
      xhrRef.current = null;
      setPhase("idle");
      setProgress(0);
    });

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("category", category);
    xhr.send(formData);
  }

  function handleCancelUpload() {
    xhrRef.current?.abort();
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !isBusy) onClose();
  }

  const sizeMB = selectedFile
    ? (selectedFile.size / 1024 / 1024).toFixed(2)
    : "0";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="mb-2 text-lg font-semibold">上传 PDF</h3>

        {/* 性能提醒 —— 长卷型 PDF 会卡渲染 */}
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="text-base leading-none">⚠️</span>
          <div className="flex-1 leading-relaxed">
            <p className="font-medium">建议上传常规分页的 PDF</p>
            <p className="mt-0.5 text-amber-800/80 dark:text-amber-200/70">
              如果是单页超长 PDF（如长截图、长卷扫描件），渲染会卡顿，AI 助手也可能失灵。
            </p>
          </div>
        </div>

        {/* 文件选择区域 */}
        <div
          className={[
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 transition-colors sm:p-8",
            isBusy
              ? "cursor-not-allowed opacity-70"
              : "cursor-pointer hover:border-primary/40",
          ].join(" ")}
          onClick={() => !isBusy && fileInputRef.current?.click()}
        >
          {selectedFile ? (
            <>
              <span className="text-3xl">📄</span>
              <p className="mt-2 line-clamp-1 break-all text-sm font-medium">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">{sizeMB} MB</p>
            </>
          ) : (
            <>
              <span className="text-4xl">📤</span>
              <p className="mt-2 text-sm text-muted-foreground">
                点击选择 PDF 文件
              </p>
              <p className="text-xs text-muted-foreground">最大 50MB</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
            disabled={isBusy}
          />
        </div>

        {/* 分类选择 —— 上传时归档到指定分类 */}
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            归档到分类
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isBusy}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {/* 用户的所有分类，加上系统兜底「未分类」放最后 */}
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
            <option value={UNCATEGORIZED}>{UNCATEGORIZED}</option>
          </select>
        </div>

        {/* 进度条 + 状态文案 —— 上传或处理中显示 */}
        {isBusy && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                {phase === "uploading"
                  ? `📤 上传中… ${progress}%`
                  : "⚙️ 处理中，请稍候…"}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {phase === "uploading"
                  ? `${((selectedFile?.size ?? 0) * progress / 100 / 1024 / 1024).toFixed(2)} / ${sizeMB} MB`
                  : "正在保存到书橱"}
              </span>
            </div>
            {/* 真实进度条；processing 阶段切成不定式条纹动画 */}
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              {phase === "uploading" ? (
                <div
                  className="h-full bg-amber-400 transition-all duration-150 ease-out"
                  style={{ width: `${progress}%` }}
                />
              ) : (
                <div className="h-full w-full animate-pulse bg-amber-400/70" />
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        {/* 操作按钮 */}
        <div className="mt-4 flex justify-end gap-3">
          {isBusy ? (
            <Button
              variant="outline"
              onClick={handleCancelUpload}
              disabled={phase === "processing"}
              title={phase === "processing" ? "已上传完成，无法取消" : "取消上传"}
            >
              {phase === "processing" ? "处理中…" : "取消"}
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
          )}
          <Button onClick={handleUpload} disabled={!selectedFile || isBusy}>
            {phase === "uploading"
              ? `上传中 ${progress}%`
              : phase === "processing"
              ? "处理中…"
              : "确认上传"}
          </Button>
        </div>
      </div>
    </div>
  );
}
