import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  DEFAULT_CATEGORIES,
  validateCategoryName,
} from "@/lib/categories";

/**
 * GET /api/categories
 *
 * 列出当前用户的所有分类。
 *
 * 兼容性：老用户在引入 Category 表之前没有任何分类记录，第一次调用时
 * 自动给他们种入预置分类（懒初始化），避免新增"全部 / 未分类"以外没有 Tab 可选。
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let categories = await prisma.category.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "asc" },
  });

  if (categories.length === 0) {
    // 懒初始化：老用户没分类时一次性种入预置分类。
    // 这里没用 skipDuplicates（依赖 Prisma client 版本），靠 createMany 自身保证：
    // userId+name 唯一约束，第一次 createMany 不会冲突；并发时另一边的请求最多收到 P2002
    // 错误，再 findMany 一次会拿到对方已写入的记录，不会丢。
    try {
      await prisma.category.createMany({
        data: DEFAULT_CATEGORIES.map((name) => ({ userId: user.userId, name })),
      });
    } catch (e) {
      console.warn("Seed categories race:", e);
    }
    categories = await prisma.category.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "asc" },
    });
  }

  return NextResponse.json({ categories });
}

/**
 * POST /api/categories  { name: string }
 *
 * 创建一个新分类。同名报 409。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const v = validateCategoryName(body?.name);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }

    try {
      const created = await prisma.category.create({
        data: { userId: user.userId, name: v.name },
      });
      return NextResponse.json({ category: created }, { status: 201 });
    } catch (e: unknown) {
      // Prisma 唯一约束冲突 → 409
      const code = (e as { code?: string })?.code;
      if (code === "P2002") {
        return NextResponse.json(
          { error: `分类「${v.name}」已存在` },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("Create category error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
