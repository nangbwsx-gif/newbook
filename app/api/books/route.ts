import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { normalizeCategory } from "@/lib/categories";

const MAX_SIZE = 50 * 1024 * 1024;
// PDF 文件头："%PDF-" 的 ASCII 字节
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

function looksLikePdf(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (buffer[i] !== PDF_MAGIC[i]) return false;
  }
  return true;
}

export async function POST(request: Request) {
  // 1. 鉴权
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请选择 PDF 文件" }, { status: 400 });
    }

    // 后缀 + MIME 双重校验
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".pdf")) {
      return NextResponse.json({ error: "只支持 PDF 格式" }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "只支持 PDF 格式" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "文件大小不能超过 50MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 文件头魔数校验（防止改后缀冒充 PDF）
    if (!looksLikePdf(buffer)) {
      return NextResponse.json(
        { error: "文件不是有效的 PDF" },
        { status: 400 }
      );
    }

    // 2. 确保上传目录存在
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    // 3. 不可猜的随机文件名（不再用时间戳+原文件名）
    //    访问要走 /api/books/[id]/file，文件名只是磁盘 ID
    const fileName = `${randomUUID()}.pdf`;
    const filePath = path.join(uploadDir, fileName);

    // 4. 写入磁盘
    await writeFile(filePath, buffer);

    // 5. 数据库记录 — title 取原文件名（去掉后缀），把展示名和磁盘名解耦
    const title = file.name.replace(/\.pdf$/i, "") || "未命名";

    // 上传弹窗会带 formData.category；缺省/非法时回落到"未分类"
    const category = normalizeCategory(formData.get("category"));

    let book;
    try {
      book = await prisma.book.create({
        data: {
          userId: user.userId,
          title,
          category,
          // 仍然保留 /uploads/xxx 这种相对路径形式，便于将来迁对象存储时识别
          fileUrl: `/uploads/${fileName}`,
        },
      });
    } catch (dbErr) {
      // DB 写失败 → 回滚已落盘的文件，避免孤儿（次级问题之一）
      await unlink(filePath).catch(() => {});
      throw dbErr;
    }

    return NextResponse.json(
      { book: { ...book, fileUrl: `/api/books/${book.id}/file` } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "上传失败，请重试" }, { status: 500 });
  }
}

export async function GET() {
  // 1. 鉴权
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const books = await prisma.book.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
    });

    // 对外暴露的 fileUrl 一律走鉴权接口；DB 内的物理路径不暴露给前端
    const safeBooks = books.map((b) => ({
      ...b,
      fileUrl: `/api/books/${b.id}/file`,
    }));

    return NextResponse.json({ books: safeBooks });
  } catch (error) {
    console.error("Fetch books error:", error);
    return NextResponse.json({ error: "获取书橱失败" }, { status: 500 });
  }
}
