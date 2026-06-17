import { create } from "zustand";

interface BookInfo {
  id: string;
  title: string;
  fileUrl: string;
  /** 数据库中保存的上次阅读页码 */
  currentPage?: number;
  /** 是否已开启公开分享，决定阅读器分享按钮的态 */
  isPublic?: boolean;
  /** 该书所有者的 userId，用于前端独立做身份对比 */
  ownerId?: string;
}

interface BookState {
  // 当前正在阅读的书
  currentBook: BookInfo | null;
  // 页码（从 1 开始）
  currentPage: number;
  totalPages: number;
  // 缩放比例（默认 1.0）
  scale: number;
  // AI 触发的高亮关键词；null 表示不高亮
  highlightKeyword: string | null;
  /**
   * 访客模式标记：通过公开分享链接访问、且当前用户不是所有者时为 true。
   * 决定 UI 是否隐藏"返回书橱 / 分享 / AI 助手 / 进度保存"等所有者专属功能。
   */
  isPublicView: boolean;
  /** 访客模式下展示给访客看的所有者用户名（如"admin"），仅 UI 用 */
  ownerUsername: string | null;

  setCurrentBook: (book: BookInfo | null) => void;
  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  setScale: (scale: number) => void;
  setHighlightKeyword: (keyword: string | null) => void;
  /** 设置当前是否访客模式 + owner 名 */
  setPublicView: (isPublic: boolean, ownerUsername: string | null) => void;
  /** 部分字段更新当前书（如分享后改 isPublic），用 patch 形式避免覆盖其他字段 */
  patchCurrentBook: (patch: Partial<BookInfo>) => void;
  reset: () => void;
}

export const useBookStore = create<BookState>((set) => ({
  currentBook: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.0,
  highlightKeyword: null,
  isPublicView: false,
  ownerUsername: null,

  // 设置当前书 —— 同时把数据库里保存的 currentPage 作为初始页码恢复
  setCurrentBook: (book) =>
    set({
      currentBook: book,
      currentPage: book?.currentPage ?? 1,
      totalPages: 0,
      scale: 1.0,
      highlightKeyword: null,
    }),

  setCurrentPage: (page) => set({ currentPage: page }),

  setTotalPages: (total) => set({ totalPages: total }),

  setScale: (scale) => set({ scale }),

  setHighlightKeyword: (keyword) => set({ highlightKeyword: keyword }),

  setPublicView: (isPublic, ownerUsername) =>
    set({ isPublicView: isPublic, ownerUsername }),

  patchCurrentBook: (patch) =>
    set((s) => (s.currentBook ? { currentBook: { ...s.currentBook, ...patch } } : {})),

  reset: () =>
    set({
      currentBook: null,
      currentPage: 1,
      totalPages: 0,
      scale: 1.0,
      highlightKeyword: null,
      isPublicView: false,
      ownerUsername: null,
    }),
}));
