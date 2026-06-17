import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UNCATEGORIZED, validateCategoryName } from "@/lib/categories";

interface RouteParams {
  params: { id: string };
}

/**
 * PATCH /api/categories/[id]  { name: string }
 *
 * 重命名分类。会同时更新该用户下所有 Book.category 等于旧名的记录，
 * 让书的分类标签跟着改。
 *
 * 注意：Book.category 是字符串而非外键（v2 设计决定，避免数据迁移），
 * 所以这里要走一个事务把 Category 表和 Book 表一起改。
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { id } = params;
    const body = await request.json();
    const v = validateCategoryName(body?.name);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }

    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat || cat.userId !== user.userId) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }
    if (cat.name === v.name) {
      // 没改 → 直接返回原对象
      return NextResponse.json({ category: cat });
    }

    try {
      const [updated] = await prisma.$transaction([
        prisma.category.update({
          where: { id },
          data: { name: v.name },
        }),
        prisma.book.updateMany({
          where: { userId: user.userId, category: cat.name },
          data: { category: v.name },
        }),
      ]);
      return NextResponse.json({ category: updated });
    } catch (e: unknown) {
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
    console.error("Patch category error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

/**
 * DELETE /api/categories/[id]
 *
 * 删除分类。该分类下的书会被迁移到「未分类」（不会丢书）。
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { id } = params;
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat || cat.userId !== user.userId) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    const [, movedCount] = await prisma.$transaction([
      prisma.category.delete({ where: { id } }),
      prisma.book.updateMany({
        where: { userId: user.userId, category: cat.name },
        data: { category: UNCATEGORIZED },
      }),
    ]);

    return NextResponse.json({
      success: true,
      // movedBooks 类型：{ count: number }
      movedBooks: (movedCount as unknown as { count: number }).count ?? 0,
    });
  } catch (error) {
    console.error("Delete category error:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
