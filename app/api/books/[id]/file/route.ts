import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";

interface RouteParams {
  params: { id: string };
}

const FILE_EXT = ".pdf";

/**
 * GET /api/books/[id]/file —— 流式返回 PDF 字节，支持 Range 请求。
 *
 * 鉴权策略（v2）：
 *   - 先按 id 查书；不存在 → 404
 *   - 公开书（isPublic=true）：直接放行，不要求登录
 *   - 私密书：必须登录 + 必须是 owner，否则 404（不暴露存在性）
 *
 * 防御性：解析后的绝对路径必须在 public/uploads 之内（防 ../ 越权）
 */
export async function GET(request: Request, { params }: RouteParams) {
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
      book.fileUrl.replace(/^[\\/]+/, "")
    );
    if (!resolved.startsWith(uploadDir + path.sep) && resolved !== uploadDir) {
      console.error("Suspicious fileUrl, refused:", book.fileUrl);
      return new NextResponse("Not Found", { status: 404 });
    }

    const fileStat = await stat(resolved).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const fileSize = fileStat.size;
    const rangeHeader = request.headers.get("range");

    // 支持 Range 请求（pdf.js 发起的范围请求，实现按需加载）
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace("bytes=", "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (!isNaN(start) && !isNaN(end) && start >= 0 && end < fileSize && start <= end) {
        const chunkSize = end - start + 1;
        const stream = createReadStream(resolved, { start, end });

        const readable = new ReadableStream({
          start(controller) {
            stream.on("data", (chunk) => controller.enqueue(chunk));
            stream.on("end", () => controller.close());
            stream.on("error", (err) => controller.error(err));
          },
        });

        return new NextResponse(readable, {
          status: 206,
          statusText: "Partial Content",
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(chunkSize),
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": book.isPublic
              ? "public, max-age=300"
              : "private, no-store",
            "Content-Disposition": `inline; filename="book-${id}${FILE_EXT}"`,
          },
        });
      }
    }

    // 无 Range 头时返回整个文件（流式）
    const fullStream = createReadStream(resolved);
    const readableFull = new ReadableStream({
      start(controller) {
        fullStream.on("data", (chunk) => controller.enqueue(chunk));
        fullStream.on("end", () => controller.close());
        fullStream.on("error", (err) => controller.error(err));
      },
    });

    return new NextResponse(readableFull, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": book.isPublic
          ? "public, max-age=300"
          : "private, no-store",
        "Content-Disposition": `inline; filename="book-${id}${FILE_EXT}"`,
      },
    });
  } catch (error) {
    console.error("Serve file error:", error);
    return NextResponse.json({ error: "读取文件失败" }, { status: 500 });
  }
}
