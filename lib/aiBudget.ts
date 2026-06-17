import { prisma } from "@/lib/prisma";

/**
 * 每个用户的免费额度上限：1 元 = 1_000_000 μcents。
 * 存 micro-cents（而不是浮点数）以避免精度漂移。
 */
export const FREE_QUOTA_MICROCENTS = 1_000_000;

/**
 * DeepSeek deepseek-chat 近似定价（单位：μcents / 1k tokens）：
 *   input:  0.5 元 / 1M tokens  → 500 μcents / 1k tokens
 *   output: 2 元 / 1M tokens    → 2000 μcents / 1k tokens
 *
 * 这些是估算值，实际可能因缓存命中、夜间折扣等有轻微差异。
 * 用来做拦截线已经够用。
 */
const INPUT_COST_PER_1K = 500;
const OUTPUT_COST_PER_1K = 2000;

/**
 * 根据 token 使用量估算成本（μcents）
 */
export function estimateCostMicroCents(inputTokens: number, outputTokens: number): number {
  const cost =
    (inputTokens / 1000) * INPUT_COST_PER_1K +
    (outputTokens / 1000) * OUTPUT_COST_PER_1K;
  return Math.ceil(cost); // 向上取整，宁可多算不要少算
}

/**
 * 检查用户是否还有免费额度。返回值 = 剩余 μcents，负数表示已超额。
 */
export async function getRemainingBudget(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiSpentMicroCents: true },
  });
  if (!user) return 0;
  return FREE_QUOTA_MICROCENTS - user.aiSpentMicroCents;
}

/**
 * 扣费：累加用户已花费的 μcents。
 */
export async function deductCost(userId: string, microCents: number) {
  await prisma.user.update({
    where: { id: userId },
    data: { aiSpentMicroCents: { increment: microCents } },
  });
}