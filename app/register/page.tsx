"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";

export default function RegisterPage() {
  const router = useRouter();
  const { user, isLoading, setUser } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 已登录用户访问注册页 → 直接跳书橱
  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/library");
    }
  }, [user, isLoading, router]);

  // 实时密码不一致提示
  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // 前端先行校验
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "注册失败");
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

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1424] px-4 py-10 text-slate-100">
      {/* ========== 背景：与首页/登录页同款氛围 ========== */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at top left, rgba(56,82,140,0.35), transparent 55%),
            radial-gradient(ellipse at bottom right, rgba(99,72,180,0.25), transparent 55%),
            radial-gradient(circle at center, rgba(255,255,255,0.02), transparent 70%)
          `,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
        }}
      />

      {/* ========== 卡片 ========== */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-2xl font-semibold text-slate-100 transition-opacity hover:opacity-80"
          >
            <span className="text-3xl">📖</span>
            <span className="font-serif tracking-wide">NewBook</span>
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <div className="mb-6 text-center">
            <h1 className="font-serif text-2xl font-bold text-slate-100">
              开启你的阅读空间
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              30 秒注册，立即拥有私人智能书橱
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
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  id="username"
                  type="text"
                  placeholder="2-20 个字符"
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
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="至少 6 位"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-11 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-amber-400/60 focus:bg-white/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
                >
                  {showPassword ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* 确认密码 */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                确认密码
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="再输一次密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={[
                    "h-11 w-full rounded-lg border bg-white/5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:bg-white/10",
                    passwordMismatch
                      ? "border-red-400/60 focus:border-red-400"
                      : "border-white/10 focus:border-amber-400/60",
                  ].join(" ")}
                />
              </div>
              {passwordMismatch && (
                <p className="mt-1 text-xs text-red-400">
                  两次输入的密码不一致
                </p>
              )}
            </div>

            {/* 提交错误 */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              >
                <span className="mt-0.5 shrink-0">⚠️</span>
                <span className="flex-1">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition-all hover:bg-amber-300 hover:shadow-xl hover:shadow-amber-500/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-amber-400"
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                  注册中...
                </>
              ) : (
                <>
                  创建账号
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-slate-500">或</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <p className="text-center text-sm text-slate-400">
            已有账号？
            <Link
              href="/login"
              className="ml-1 font-medium text-amber-300 underline underline-offset-4 hover:text-amber-200"
            >
              立即登录
            </Link>
          </p>
        </div>

        {/* 福利提示卡 */}
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-center text-xs text-amber-200/90 backdrop-blur-sm">
          <span className="mr-1">🎁</span>
          注册即送 <span className="font-medium">1 元 AI 助手额度</span>，可问数百次
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-300">
            ← 返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}
