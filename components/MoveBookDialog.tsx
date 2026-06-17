"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { showToast } from "@/lib/showToast";
import { UNCATEGORIZED } from "@/lib/categories";
import type { Category } from "./CategoryManagerDialog";

interface MoveBookDialogProps {
  open: boolean;
  bookId: string;
  bookTitle: string;
  currentCategory: string;
  /** 父组件已经在维护的分类列表，不再二次拉 */
  categories: Category[];
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * 把一本书移动到另一个分类。
 * 选项 = 用户的所有分类 + "未分类"（系统兜底）。
 */
export function MoveBookDialog({
  open,
  bookId,
  bookTitle,
  currentCategory,
  categories,
  onClose,
  onSuccess,
}: MoveBookDialogProps) {
  const [target, setTarget] = useState<string>(currentCategory);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setTarget(currentCategory || UNCATEGORIZED);
  }, [open, currentCategory]);

  if (!open) return null;

  async function handleSave() {
    if (target === currentCategory) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "移动失败", "error");
        return;
      }
      showToast(`已移到「${target}」`);
      onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !saving) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold">移动到分类</h3>
        <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
          《{bookTitle}》
        </p>

        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={saving}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {/* 系统兜底分类排第一 */}
          <option value={UNCATEGORIZED}>{UNCATEGORIZED}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "移动"}
          </Button>
        </div>
      </div>
    </div>
  );
}
