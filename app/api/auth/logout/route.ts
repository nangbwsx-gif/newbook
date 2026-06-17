import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { TOKEN_NAME } from "@/lib/auth";

/**
 * POST /api/auth/logout
 * httpOnly cookie 浏览器 JS 删不了，必须由服务端 Set-Cookie 清掉。
 */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_NAME);
  return NextResponse.json({ success: true });
}
