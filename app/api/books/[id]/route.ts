import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { unlink } from "fs/promises";
import path from "path";
import { normalizeCategory } from "@/lib/categories";

interface RouteParams {
  params: { id: string };
}

/**
 * GET — 获取单本书详情。
 *
 * 鉴权策略（v2）：
 *   - 公开书 (isPublic=true)：任何人可见，但隐藏 currentPage 这种私人状态
 *   - 私密书：必须是登录的拥有者
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = params;
    const book = await prisma.book.findUnique({ where: { id } });

    if (!book) {
      return NextResponse.json({ error: "书籍不存在" }, { status: 404 });
    }

    if (!book.isPublic) {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "请先登录" }, { status: 401 });
      }
      if (book.userId !== user.userId) {
        return NextResponse.json({ error: "无权操作" }, { status: 403 });
      }
    } else {
      // 公开书：访客也能看，但访客不应看到所有者的私人阅读进度
      // 只有所有者本人访问时才完整返回
      const user = await getCurrentUser();
      if (!user || user.userId !== book.userId) {
        // 同时取一下 owner 的展示名，给访客 UI 用（"@xxx 的书架"）
        const owner = await prisma.user.findUnique({
          where: { id: book.userId },
          select: { username: true },
        });
        return NextResponse.json({
          book: {
            id: book.id,
            title: book.title,
            category: book.category,
            isPublic: book.isPublic,
            createdAt: book.createdAt,
            // 公开访客从第 1 页开始，不继承所有者的进度
            currentPage: 1,
            fileUrl: `/api/books/${book.id}/file`,
            // 暴露 ownerId 供前端独立做身份对比
            ownerId: book.userId,
          },
          isPublicView: true,
          ownerUsername: owner?.username ?? null,
        });
      }
    }

    return NextResponse.json({
      book: { ...book, fileUrl: `/api/books/${book.id}/file`, ownerId: book.userId },
    });
  } catch (error) {
    console.error("Get book error:", error);
    return NextResponse.json({ error: "获取书籍失败" }, { status: 500 });
  }
}

/**
 * PATCH — 更新书籍。
 *
 * 必须是登录的所有者才能改。可改字段：
 *   - title         重命名
 *   - currentPage   阅读进度（防抖保存）
 *   - category      分类标签
 *   - isPublic      公开/私密开关（一键分享）
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { id } = params;
    const body = await request.json();

    // 校验这本书属于当前用户
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) {
      return NextResponse.json({ error: "书籍不存在" }, { status: 404 });
    }
    if (book.userId !== user.userId) {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    // 收集要更新的字段
    const data: {
      title?: string;
      currentPage?: number;
      category?: string;
      isPublic?: boolean;
    } = {};

    // ---- 标题（重命名场景） ----
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return NextResponse.json({ error: "书名不能为空" }, { status: 400 });
      }
      if (body.title.trim().length > 100) {
        return NextResponse.json(
          { error: "书名不能超过 100 个字符" },
          { status: 400 }
        );
      }
      data.title = body.title.trim();
    }

    // ---- 阅读进度（防抖保存场景） ----
    if (body.currentPage !== undefined) {
      const page = Number(body.currentPage);
      if (!Number.isInteger(page) || page < 1 || page > 99999) {
        return NextResponse.json(
          { error: "页码必须是 1–99999 的整数" },
          { status: 400 }
        );
      }
      data.currentPage = page;
    }

    // ---- 分类（编辑/重新归档） ----
    if (body.category !== undefined) {
      data.category = normalizeCategory(body.category);
    }

    // ---- 公开开关（一键分享） ----
    if (body.isPublic !== undefined) {
      if (typeof body.isPublic !== "boolean") {
        return NextResponse.json(
          { error: "isPublic 必须是 true / false" },
          { status: 400 }
        );
      }
      data.isPublic = body.isPublic;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "没有要更新的字段" }, { status: 400 });
    }

    const updated = await prisma.book.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      book: { ...updated, fileUrl: `/api/books/${updated.id}/file`, ownerId: updated.userId },
    });
  } catch (error) {
    console.error("Patch book error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

/** DELETE — 删除书籍（数据库 + 磁盘文件） */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { id } = params;

    const book = await prisma.book.findUnique({ where: { id } });

    if (!book) {
      return NextResponse.json({ error: "书籍不存在" }, { status: 404 });
    }

    if (book.userId !== user.userId) {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    // 删除磁盘文件
    try {
      const uploadDir = path.resolve(process.cwd(), "public", "uploads");
      const resolved = path.resolve(
        process.cwd(),
        "public",
        book.fileUrl.replace(/^[\\/]+/, "")
      );
      // 防御性校验：路径必须在 public/uploads 之内
      if (
        resolved.startsWith(uploadDir + path.sep) ||
        resolved === uploadDir
      ) {
        await unlink(resolved);
      } else {
        console.warn("Refused to unlink outside uploads dir:", book.fileUrl);
      }
    } catch (err: unknown) {
      // 只把"文件本来就不存在"当成正常情况；其他错误（EPERM/EBUSY）记下来
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        console.warn("文件不存在，跳过磁盘删除:", book.fileUrl);
      } else {
        console.error("删除文件失败（继续删除 DB 记录）:", code, book.fileUrl);
        // 注意：仍然删 DB 记录，避免列表里留着一本"无法操作"的死书。
        // 真正生产环境应该把 fileUrl 推到清理队列重试，这里先记日志。
      }
    }

    // 删除数据库记录
    await prisma.book.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
