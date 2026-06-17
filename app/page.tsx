"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * 产品首页（公开访问）
 *
 * 设计目标：
 *   - 没登录的访客：看清楚这是什么 → 引导注册/登录
 *   - 已登录用户：一键进入书橱
 *   - 视觉与书橱保持一致：深蓝氛围 + 暖橙强调，不引入新调色板
 */
export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();

  // 让 CTA 按钮根据登录态显示不同文案；hydration 期间先按"未知"渲染，
  // 挂载后再读 store，避免 SSR/CSR 不一致。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isLoggedIn = mounted && !isLoading && !!user;

  function handlePrimaryCTA() {
    if (isLoggedIn) router.push("/library");
    else router.push("/login");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1424] text-slate-100">
      {/* ========== 背景装饰：与书橱页同款氛围 ========== */}
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

      {/* ========== 顶部导航 ========== */}
      <header className="relative z-10 border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-semibold text-slate-100"
          >
            <span className="text-2xl">📖</span>
            <span className="font-serif tracking-wide">NewBook</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            {isLoggedIn ? (
              <>
                <span className="hidden text-sm text-slate-400 sm:inline">
                  👤 {user?.username}
                </span>
                <Link
                  href="/library"
                  className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-amber-300"
                >
                  进入书橱
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-slate-100"
                >
                  登录
                </Link>
                <Link
                  href="/register"
                  className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-amber-300"
                >
                  免费注册
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ========== Hero 区 ========== */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="text-center">
          {/* 小徽章 */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            带 AI 助手的私人 PDF 阅读器
          </div>

          {/* 主标题 */}
          <h1 className="mb-6 font-serif text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            <span className="bg-gradient-to-br from-slate-100 to-slate-300 bg-clip-text text-transparent">
              把每一份 PDF
            </span>
            <br />
            <span className="bg-gradient-to-br from-amber-300 to-amber-500 bg-clip-text text-transparent">
              变成可以对话的书
            </span>
          </h1>

          {/* 副标 */}
          <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            上传 PDF 文献，按分类整理你的私人书橱。
            <br className="hidden sm:inline" />
            内置 AI 阅读助手，一键定位、即时问答，让阅读真正高效。
          </p>

          {/* 主 CTA */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={handlePrimaryCTA}
              className="group inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-amber-400 px-8 text-base font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition-all hover:-translate-y-0.5 hover:bg-amber-300 hover:shadow-xl hover:shadow-amber-500/40 sm:w-auto"
            >
              {isLoggedIn ? "进入我的书橱" : "立即开始"}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform group-hover:translate-x-1"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            {!isLoggedIn && (
              <Link
                href="/login"
                className="inline-flex h-12 w-full max-w-xs items-center justify-center rounded-lg border border-white/10 bg-white/5 px-8 text-base font-medium text-slate-200 transition-colors hover:bg-white/10 sm:w-auto"
              >
                我已有账号
              </Link>
            )}
          </div>

          {/* 信任徽章 */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckIcon /> 注册即送 1 元 AI 额度
            </span>
            <span className="flex items-center gap-1.5">
              <CheckIcon /> 文件加密私有
            </span>
            <span className="flex items-center gap-1.5">
              <CheckIcon /> 永久免费基础功能
            </span>
          </div>
        </div>

        {/* 装饰：模拟阅读器外观 */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gray-900/80 shadow-2xl shadow-black/50 backdrop-blur-sm">
            {/* 模拟工具栏 */}
            <div className="flex h-10 items-center gap-2 border-b border-white/10 bg-gray-900/90 px-4">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400/80" />
                <div className="h-3 w-3 rounded-full bg-amber-400/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-400/80" />
              </div>
              <div className="ml-3 flex items-center gap-2 rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                📖 NewBook
              </div>
            </div>
            {/* 模拟内容 */}
            <div className="grid gap-3 p-6 sm:grid-cols-3 sm:p-8">
              {[
                { emoji: "📄", title: "深度学习综述", cat: "CV综述" },
                { emoji: "📄", title: "Transformer 详解", cat: "多模态大模型" },
                { emoji: "📄", title: "异常检测方法", cat: "医学异常检测" },
              ].map((b, i) => (
                <div
                  key={i}
                  className="rounded-md bg-amber-50/95 p-3 shadow-md"
                >
                  <div className="mb-2 aspect-[3/4] rounded bg-gradient-to-br from-amber-100 to-amber-200/80 p-3 text-center text-3xl text-amber-900/40">
                    <div className="flex h-full items-center justify-center">
                      {b.emoji}
                    </div>
                  </div>
                  <p className="line-clamp-1 text-xs font-medium text-amber-950">
                    {b.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-amber-700/70">
                    {b.cat}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ========== 功能特性 ========== */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:pb-28">
        <div className="mb-12 text-center">
          <h2 className="font-serif text-2xl font-bold text-slate-100 sm:text-3xl">
            为研究者 / 学生 / 长读者打造
          </h2>
          <p className="mt-3 text-sm text-slate-400 sm:text-base">
            把碎片化的 PDF 变成结构化的私人知识库
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon="📚"
            title="私人书橱"
            desc="按你自己的分类整理 PDF。每个文件加密存储、私有访问，没你的同意没人能看到。"
          />
          <FeatureCard
            icon="🤖"
            title="AI 阅读助手"
            desc="基于 DeepSeek 的智能助手。问「参考文献在哪页」，自动跳转 + 高亮原文。注册即送 1 元额度。"
          />
          <FeatureCard
            icon="📂"
            title="自定义分类"
            desc="不再被预设标签框住。自由新建/重命名/删除分类，删除时书自动落回「未分类」，永远不丢。"
          />
          <FeatureCard
            icon="🔗"
            title="一键公开分享"
            desc="给同事/导师看某篇论文？一键生成访问链接，对方无需注册即可阅读。随时可取消公开。"
          />
        </div>
      </section>

      {/* ========== 第二屏：交互高亮 ========== */}
      <section className="relative z-10 border-t border-white/5 bg-[#070e1c]/60 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                AI 助手
              </div>
              <h3 className="mb-4 font-serif text-3xl font-bold leading-tight text-slate-100 sm:text-4xl">
                不再是「问答机」<br />
                而是<span className="text-amber-300">能跳转的</span>研究伙伴
              </h3>
              <p className="mb-6 text-base leading-relaxed text-slate-400">
                传统 AI 工具只回答你的问题，NewBook 的 AI
                助手会真的把你<strong className="text-slate-200">带到那一页</strong>。
              </p>
              <ul className="space-y-3 text-sm text-slate-300">
                {[
                  "🎯 问「找一下结论部分」→ 自动翻到对应页码",
                  "🖍️ 高亮原文片段，让你一眼定位答案出处",
                  "📝 多轮对话保持上下文，连续追问不丢线索",
                  "💰 按 token 计费，注册赠 1 元够用很久",
                ].map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 对话气泡示意 */}
            <div className="rounded-xl border border-white/10 bg-gray-900/80 p-5 shadow-2xl shadow-black/40">
              <div className="space-y-3">
                <Bubble role="user">这篇论文的实验结果在第几页？</Bubble>
                <Bubble role="assistant">
                  📍 已为你跳转到第 <strong>7 页</strong>
                  ，并高亮"Table 3: Results on benchmark…"
                </Bubble>
                <Bubble role="user">那 baseline 是怎么选的？</Bubble>
                <Bubble role="assistant" loading>
                  正在阅读相关章节…
                </Bubble>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== 底部 CTA ========== */}
      <section className="relative z-10 mx-auto max-w-3xl px-4 py-20 text-center sm:py-28">
        <h2 className="mb-4 font-serif text-3xl font-bold sm:text-4xl">
          {isLoggedIn ? "欢迎回来" : "现在就把你的第一本 PDF 搬进来吧"}
        </h2>
        <p className="mb-8 text-slate-400">
          {isLoggedIn
            ? `Hi ${user?.username}，你的书橱在等你。`
            : "30 秒注册，立即拥有自己的智能阅读空间。"}
        </p>
        <button
          onClick={handlePrimaryCTA}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-amber-400 px-10 text-base font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition-all hover:-translate-y-0.5 hover:bg-amber-300"
        >
          {isLoggedIn ? "进入我的书橱" : "免费注册"}
        </button>
      </section>

      {/* ========== Footer ========== */}
      <footer className="relative z-10 border-t border-white/5 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-500">
          NewBook · 一个用于简历展示的在线 PDF 阅读器项目
        </div>
      </footer>
    </div>
  );
}

// ========== 子组件 ==========

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-emerald-400"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="group rounded-xl border border-white/5 bg-white/[0.02] p-5 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-amber-400/30 hover:bg-white/[0.04]">
      <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-2xl">
        {icon}
      </div>
      <h3 className="mb-2 text-base font-semibold text-slate-100">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-400">{desc}</p>
    </div>
  );
}

function Bubble({
  role,
  children,
  loading,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
  loading?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-amber-400 text-amber-950"
            : "bg-white/5 text-slate-200",
        ].join(" ")}
      >
        {children}
        {loading && (
          <span className="ml-2 inline-flex gap-1 align-middle">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
          </span>
        )}
      </div>
    </div>
  );
}
