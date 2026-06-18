import path from "path";

/**
 * 校验文件路径是否安全落在 `public/uploads` 目录内。
 *
 * 用于防止通过 fileUrl 构造恶意路径（如 ../ 越权读取系统文件）。
 * DELETE 接口和文件流式读取接口都需要做这个校验。
 *
 * @param fileUrl — 数据库中的 book.fileUrl，形如 "/uploads/xxx.pdf"
 * @returns 解析后的绝对路径；不合法时返回 null
 */
export function safeResolveUploadPath(
  fileUrl: string
): string | null {
  const uploadDir = path.resolve(process.cwd(), "public", "uploads");
  const resolved = path.resolve(
    process.cwd(),
    "public",
    fileUrl.replace(/^[\\/]+/, "")
  );

  if (
    resolved.startsWith(uploadDir + path.sep) ||
    resolved === uploadDir
  ) {
    return resolved;
  }

  console.warn("Suspicious fileUrl, refused:", fileUrl);
  return null;
}
