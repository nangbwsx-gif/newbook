import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signToken, TOKEN_NAME, TOKEN_MAX_AGE } from "@/lib/auth";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

export async function POST(request: Request) {
  try {
    const { username, password, confirmPassword } = await request.json();

    // 1. 字段校验
    if (!username || !password || !confirmPassword) {
      return NextResponse.json(
        { error: "请填写所有字段" },
        { status: 400 }
      );
    }

    // 2. 两次密码一致性
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "两次输入的密码不一致" },
        { status: 400 }
      );
    }

    // 3. 用户名长度
    if (username.length < 2 || username.length > 20) {
      return NextResponse.json(
        { error: "用户名长度需要 2-20 个字符" },
        { status: 400 }
      );
    }

    // 4. 密码强度
    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码长度至少 6 位" },
        { status: 400 }
      );
    }

    // 5. 查重
    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      return NextResponse.json(
        { error: "该用户名已被注册" },
        { status: 409 }
      );
    }

    // 6. 加密密码并创建用户
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    // 7. 给新用户种入预置分类，避免一上来 Tab 栏只有"全部 / 未分类"
    //    用 createMany 一次插入；这里写库那一刻该用户刚创建，不会有并发冲突。
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({ userId: user.id, name })),
    });

    // 8. 注册即登录 — 签发 JWT
    const token = await signToken({
      userId: user.id,
      username: user.username,
    });

    const cookieStore = await cookies();
    cookieStore.set(TOKEN_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: TOKEN_MAX_AGE,
      path: "/",
    });

    return NextResponse.json(
      {
        user: { userId: user.id, username: user.username },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}
