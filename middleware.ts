import { NextRequest, NextResponse } from "next/server";
import { verifyToken, TOKEN_NAME } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 首页 / 是产品介绍页，公开放行（包括 /api/auth/me 这种"我登了没"探针）
  if (pathname === "/" || pathname === "/api/auth/me") {
    return NextResponse.next();
  }

  // /uploads 一律不直接对外。即使带着合法 token 也走 /api/books/[id]/file 做归属检查。
  // 老链接（如旧客户端缓存）会拿到 404，符合"私密资源不可猜"的语义。
  if (pathname.startsWith("/uploads")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 公开路径放行
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 静态资源放行
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|ico|css|js|mjs)$/)
  ) {
    return NextResponse.next();
  }

  // /book/<id> 阅读页 + /api/books/<id> 详情/文件接口：
  // 这两条路由对外承担"公开分享链接"语义。中间件这层只做放行，
  // 真正的鉴权（公开书直接返回，私密书仍然要求登录）交给路由自己。
  // 这是因为 middleware 在 edge 不能查 Prisma，得让路由处理。
  const BOOK_PAGE = /^\/book\/[^/]+\/?$/;
  const BOOK_API = /^\/api\/books\/[^/]+(\/file)?\/?$/;
  if (BOOK_PAGE.test(pathname) || BOOK_API.test(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(TOKEN_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifyToken(token);

  if (!payload) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(TOKEN_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
