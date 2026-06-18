"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { PageBackground } from "@/components/PageBackground";
import {
  UserIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  ArrowRightIcon,
} from "@/components/Icons";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading, setUser } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 已登录用户访问登录页 → 直接跳书橱，避免 UX 死循环
  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/library");
    }
  }, [user, isLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }

      setUser(data.user);
      router.push("/library");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  /** 一键填充测试账号，方便演示 */
  function fillDemoAccount() {
    setUsername("admin");
    setPassword("admin123");
    setError("");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1424] px-4 py-10 text-slate-100">
      {/* ========== 背景：与首页/书橱页同款氛围 ========== */}
      <PageBackground />

      {/* ========== 卡片 ========== */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo —— 点回首页，避免登录页变成绝路 */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-2xl font-semibold text-slate-100 transition-opacity hover:opacity-80"
          >
            <span className="text-3xl">📖</span>
            <span className="font-serif tracking-wide">NewBook</span>
          </Link>
        </div>

        {/* 登录卡片本体 */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <div className="mb-6 text-center">
            <h1 className="font-serif text-2xl font-bold text-slate-100">
              欢迎回来
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              登录你的私人阅读空间
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* 用户名 */}
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                用户名
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <UserIcon />
                </span>
                <input
                  id="username"
                  type="text"
                  placeholder="请输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-amber-400/60 focus:bg-white/10"
                />
              </div>
            </div>

            {/* 密码 */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                密码
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <LockIcon />
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-11 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-amber-400/60 focus:bg-white/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
                >
                  {showPassword ? (
                    <EyeOffIcon />
                  ) : (
                    <EyeIcon />
                  )}
                </button>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              >
                <span className="mt-0.5 shrink-0">⚠️</span>
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition-all hover:bg-amber-300 hover:shadow-xl hover:shadow-amber-500/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-amber-400"
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                  登录中...
                </>
              ) : (
                <>
                  登录
                  <ArrowRightIcon />
                </>
              )}
            </button>
          </form>

          {/* 分隔 + 注册引导 */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-slate-500">或</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <p className="text-center text-sm text-slate-400">
            还没有账号？
            <Link
              href="/register"
              className="ml-1 font-medium text-amber-300 underline underline-offset-4 hover:text-amber-200"
            >
              立即注册
            </Link>
          </p>
        </div>

        {/* 演示账号提示卡 */}
        <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-center text-xs text-emerald-200/90 backdrop-blur-sm">
          <span className="mr-1">🎁</span>
          演示账号：<span className="font-mono font-medium">admin / admin123</span>
          <button
            type="button"
            onClick={fillDemoAccount}
            className="ml-2 rounded bg-emerald-400/15 px-2 py-0.5 text-emerald-200 transition-colors hover:bg-emerald-400/25"
          >
            一键填充
          </button>
        </div>

        {/* 回首页链接 */}
        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-300">
            ← 返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}
