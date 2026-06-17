"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { showToast } from "@/lib/showToast";
import { CATEGORY_NAME_MAX } from "@/lib/categories";

export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

interface CategoryManagerDialogProps {
  open: boolean;
  onClose: () => void;
  /** 父组件托管 categories 数据，关闭时重新拉一次保持同步 */
  onChanged: () => void;
}

/**
 * 分类管理弹窗。
 * 三种动作：新建、改名、删除。
 * 删除会把该分类下的书迁移到「未分类」，提示用户。
 */
export function CategoryManagerDialog({
  open,
  onClose,
  onChanged,
}: CategoryManagerDialogProps) {
  const [list, setList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  // 新建用
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // 改名用：当前正在改的 id 和草稿名
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);

  // 二次确认删除
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setList(data.categories ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      reload();
      // 重置 transient state，避免上次残留
      setNewName("");
      setEditingId(null);
      setConfirmDeleteId(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "创建失败", "error");
        return;
      }
      setNewName("");
      await reload();
      onChanged();
      showToast("分类已创建");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setEditingName(c.name);
  }

  async function saveEdit() {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "重命名失败", "error");
        return;
      }
      setEditingId(null);
      await reload();
      onChanged();
      showToast("已重命名");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "删除失败", "error");
        return;
      }
      setConfirmDeleteId(null);
      await reload();
      onChanged();
      const moved = data.movedBooks ?? 0;
      showToast(
        moved > 0
          ? `分类已删除，${moved} 本书移到「未分类」`
          : "分类已删除"
      );
    } finally {
      setDeleting(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">管理分类</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 新建 */}
        <div className="mb-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新建分类名…"
            maxLength={CATEGORY_NAME_MAX}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
          >
            {creating ? "…" : "新建"}
          </Button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto rounded-md border border-border">
          {loading && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              加载中…
            </div>
          )}
          {!loading && list.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              还没有自定义分类
            </div>
          )}
          {!loading &&
            list.map((c) => {
              const isEditing = editingId === c.id;
              const isConfirmingDelete = confirmDeleteId === c.id;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
                >
                  {isEditing ? (
                    <>
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        maxLength={CATEGORY_NAME_MAX}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 rounded border border-border bg-card px-2 py-1 text-sm outline-none focus:border-primary"
                      />
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        disabled={!editingName.trim() || saving}
                      >
                        保存
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                      >
                        取消
                      </Button>
                    </>
                  ) : isConfirmingDelete ? (
                    <>
                      <span className="flex-1 text-sm text-red-500">
                        删除「{c.name}」？该分类下的书会移到「未分类」
                      </span>
                      <Button
                        size="sm"
                        onClick={() => doDelete(c.id)}
                        disabled={deleting}
                        className="bg-red-500 text-white hover:bg-red-600"
                      >
                        确认
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deleting}
                      >
                        取消
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm">{c.name}</span>
                      <button
                        onClick={() => startEdit(c)}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="重命名"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(c.id)}
                        className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="删除"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              );
            })}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          💡 提示：「未分类」是系统兜底分类，无法管理。
        </p>
      </div>
    </div>
  );
}
