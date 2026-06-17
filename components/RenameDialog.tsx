"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { showToast } from "@/lib/showToast";

interface RenameDialogProps {
  open: boolean;
  bookId: string;
  currentTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RenameDialog({
  open,
  bookId,
  currentTitle,
  onClose,
  onSuccess,
}: RenameDialogProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // 每次弹窗打开时，用当前书名填充输入框
  useEffect(() => {
    if (open) {
      setTitle(currentTitle);
      setError("");
    }
  }, [open, currentTitle]);

  if (!open) return null;

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("书名不能为空");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "重命名失败");
        return;
      }

      onSuccess();
      onClose();
      showToast("已重命名");
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold">重命名</h3>

        <Input
          label="书名"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          error={error}
          autoFocus
        />

        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
