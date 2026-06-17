/**
 * 极简的 className 合并工具，处理 Tailwind utility 冲突。
 *
 * 用法：cn("bg-primary text-white", userClassName)
 *
 * 当 userClassName 中出现某个"组"的 utility 时（如 bg-、text-），
 * 自动移除 base 中同组的 utility，让 user 的覆盖生效。
 *
 * 这是 tailwind-merge 的零依赖最小子集，只覆盖项目里实际用到的几组。
 */

// 每一组都是一个正则，匹配该组下任意 utility（含 hover: / focus: / dark: 等前缀）
const CONFLICT_GROUPS: RegExp[] = [
  // 背景色：bg-primary, bg-amber-400, hover:bg-amber-300
  /(?:^|:)bg-[a-z0-9-]+(?:\/\d+)?$/,
  // 文字色：text-white, text-amber-950
  /(?:^|:)text-(?:[a-z]+-\d+|white|black|transparent|inherit|current)(?:\/\d+)?$/,
  // 边框色：border-border, border-amber-200
  /(?:^|:)border-[a-z]+-\d+(?:\/\d+)?$/,
];

function classGroup(token: string): number {
  // 把 hover:bg-foo / focus-visible:bg-foo 拆成 prefix+base，逐组测试
  for (let i = 0; i < CONFLICT_GROUPS.length; i++) {
    if (CONFLICT_GROUPS[i].test(token)) return i;
  }
  return -1;
}

/** 主入口：base 在前，override 在后；后者的同组 utility 会覆盖前者。 */
export function cn(...inputs: Array<string | undefined | null | false>): string {
  const tokens = inputs
    .filter((s): s is string => Boolean(s))
    .flatMap((s) => s.split(/\s+/))
    .filter(Boolean);

  // 后写的同组 utility 覆盖先写的
  const seen = new Map<string, number>(); // group → 该组最后一个 token 的索引
  const result: (string | null)[] = [];

  tokens.forEach((token) => {
    // 拆分前缀（hover:、focus-visible: 等），整体作为分组判断的子串
    // 同时区分 hover:bg-x 和 bg-x —— 前缀不同视为不同组
    const colonIdx = token.lastIndexOf(":");
    const base = colonIdx >= 0 ? token.slice(colonIdx + 1) : token;
    const prefix = colonIdx >= 0 ? token.slice(0, colonIdx + 1) : "";

    const groupIdx = classGroup(base);
    if (groupIdx < 0) {
      result.push(token);
      return;
    }

    const groupKey = `${prefix}#${groupIdx}`;
    if (seen.has(groupKey)) {
      // 覆盖：把先前那个 token 标记为 null（删除）
      result[seen.get(groupKey)!] = null;
    }
    seen.set(groupKey, result.length);
    result.push(token);
  });

  return result.filter(Boolean).join(" ");
}
