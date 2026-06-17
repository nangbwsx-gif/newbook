/**
 * 文献分类常量 + 工具函数。
 * 用户的分类列表存在 DB 的 Category 表里；这里只保留：
 *   - "未分类" 这个系统兜底分类（不写库，删除分类时书会落回这个值）
 *   - "全部"  这个 UI Tab 伪选项
 *   - 新用户注册时初始化的预置分类名（写库）
 *   - 校验/规范化函数
 */

/** "未分类" —— 系统兜底分类，不可删、不可重命名、不写 Category 表 */
export const UNCATEGORIZED = "未分类";

/** "全部" 是 UI 层伪 Tab，不会落到 DB */
export const ALL_TAB = "__ALL__";

/**
 * 新用户注册时自动创建的预置分类。
 * 这些只是初始化用，用户可以删/改/加，不再是固定不变的。
 */
export const DEFAULT_CATEGORIES = [
  "医学异常检测",
  "CV综述",
  "多模态大模型",
] as const;

export type CategoryTab = typeof ALL_TAB | string;

/** 名字最大长度 */
export const CATEGORY_NAME_MAX = 30;

/**
 * 校验/规范化前端传来的 category 名。
 * 任何字符串都接受（用户可自定义），只做基本清洗 + 长度限制。
 * 空串或非字符串 → 落到"未分类"。
 */
export function normalizeCategory(input: unknown): string {
  if (typeof input !== "string") return UNCATEGORIZED;
  const t = input.trim();
  if (!t) return UNCATEGORIZED;
  return t.slice(0, CATEGORY_NAME_MAX);
}

/**
 * 创建/重命名分类时的严格校验。
 * 比 normalize 严：禁止空值、禁止"未分类"（占用系统名）、禁止超长。
 *
 * @returns 校验通过返回干净的 name；失败返回错误信息
 */
export function validateCategoryName(input: unknown):
  | { ok: true; name: string }
  | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "分类名必须是字符串" };
  const t = input.trim();
  if (!t) return { ok: false, error: "分类名不能为空" };
  if (t.length > CATEGORY_NAME_MAX) {
    return { ok: false, error: `分类名不能超过 ${CATEGORY_NAME_MAX} 个字符` };
  }
  if (t === UNCATEGORIZED) {
    return { ok: false, error: `「${UNCATEGORIZED}」是系统保留名，不能使用` };
  }
  return { ok: true, name: t };
}
