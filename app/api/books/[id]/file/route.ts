import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { stat, readFile } from "fs/promises";
import path from "path";

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/books/[id]/file —— 流式返回 PDF 字节。
 *
 * 鉴权策略（v2）：
 *   - 先按 id 查书；不存在 → 404
 *   - 公开书（isPublic=true）：直接放行，不要求登录
 *   - 私密书：必须登录 + 必须是 owner，否则 404（不暴露存在性）
 *
 * 防御性：解析后的绝对路径必须在 public/uploads 之内（防 ../ 越权）
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = params;
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // 公开书无需鉴权；私密书走原有 owner 校验
    if (!book.isPublic) {
      const user = await getCurrentUser();
      if (!user || book.userId !== user.userId) {
        return new NextResponse("Not Found", { status: 404 });
      }
    }

    // 防御性解析：fileUrl 形如 "/uploads/xxx.pdf"
    const uploadDir = path.resolve(process.cwd(), "public", "uploads");
    const resolved = path.resolve(
      process.cwd(),
      "public",
      // 去掉前导斜杠后再 join
      book.fileUrl.replace(/^[\\/]+/, "")
    );
    if (!resolved.startsWith(uploadDir + path.sep) && resolved !== uploadDir) {
      console.error("Suspicious fileUrl, refused:", book.fileUrl);
      return new NextResponse("Not Found", { status: 404 });
    }

    const data = await stat(resolved).catch(() => null);
    if (!data || !data.isFile()) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const buf = await readFile(resolved);

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buf.length),
        // 公开书可以让浏览器/CDN 缓存，私密书必须 private
        "Cache-Control": book.isPublic
          ? "public, max-age=300"
          : "private, no-store",
        "Content-Disposition": `inline; filename="book-${id}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Serve file error:", error);
    return NextResponse.json({ error: "读取文件失败" }, { status: 500 });
  }
}
