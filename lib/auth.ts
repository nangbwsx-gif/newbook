import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// 启动时硬校验：缺失 JWT_SECRET 直接抛错，避免用空密钥签出可被任意伪造的 token
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  throw new Error(
    "JWT_SECRET 环境变量未设置或太短（至少 16 字符）。请在 .env 中配置一个足够随机的密钥。"
  );
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const TOKEN_NAME = "auth-token";
const EXPIRES_IN = "7d";
// 与 JWT 的 7d 保持一致，避免两边漂移
export const TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

export interface JwtPayload {
  userId: string;
  username: string;
}

/** 签发 JWT token */
export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(JWT_SECRET);
}

/** 验证 JWT token */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

/** 从当前请求的 Cookie 中获取登录用户，未登录返回 null */
export async function getCurrentUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { TOKEN_NAME };
