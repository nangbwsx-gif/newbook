import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  deductCost,
  estimateCostMicroCents,
  getRemainingBudget,
} from "@/lib/aiBudget";
import {
  buildDefaultSystemPrompt,
  buildSummarySystemPrompt,
} from "@/lib/prompts";

// 长流式响应需要 Node 运行时
export const runtime = "nodejs";
export const maxDuration = 60;

// ===== DeepSeek（OpenAI 兼容协议）客户端 =====
// DeepSeek 只实现了传统的 /v1/chat/completions 端点，
// 没有实现 OpenAI 新的 /v1/responses 端点。
// AI SDK v6 默认走 responses，所以下面调用 deepseek.chat(...) 强制走 chat completions。
const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
});

interface ChatRequestBody {
  messages: UIMessage[];
  // 前端从当前 PDF 抽取的文本（带 [第 N 页] 标记），作为 system 上下文
  pdfContext?: string;
  bookTitle?: string;
  // 全文总结模式：前端发送全书文本，要求 AI 给出结构化总结
  isFullSummary?: boolean;
}

export async function POST(req: Request) {
  // 鉴权
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { error: "服务端未配置 DEEPSEEK_API_KEY" },
      { status: 500 }
    );
  }

  // ===== 额度检查：每个用户免费 1 元 =====
  const remaining = await getRemainingBudget(user.userId);
  if (remaining <= 0) {
    return NextResponse.json(
      {
        error:
          "你的 AI 助手免费额度已用完（1 元）。请联系管理员或在后续版本中充值。",
      },
      { status: 402 } // Payment Required
    );
  }

  const { messages, pdfContext, bookTitle, isFullSummary }: ChatRequestBody =
    await req.json();

  // ===== System Prompt =====
  const systemPrompt = isFullSummary
    ? buildSummarySystemPrompt({ bookTitle, pdfContext })
    : buildDefaultSystemPrompt({ bookTitle, pdfContext });

  const result = streamText({
    // 关键：用 .chat() 走 /v1/chat/completions，而不是默认的 /v1/responses
    model: deepseek.chat(process.env.DEEPSEEK_MODEL || "deepseek-chat"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: {
      navigateAndHighlight: tool({
        description:
          "当用户要求查找/定位 PDF 中的特定内容时调用：跳转到目标页并高亮原文片段。",
        inputSchema: z.object({
          pageNumber: z
            .number()
            .int()
            .min(1)
            .describe("目标内容所在的页码（PDF 真实页码，从 1 开始）"),
          exactText: z
            .string()
            .min(2)
            .max(200)
            .describe(
              "用于高亮匹配的原文片段，必须从 PDF 原文中逐字复制，5-30 个字最佳"
            ),
          reason: z
            .string()
            .describe("一句话告诉用户为什么跳转到这里（中文）"),
        }),
        // 服务端 execute —— 真正的副作用（翻页/高亮）由前端读取 part.input 后执行；
        // 这里返回一个确认 output，让模型知道工具调用已成功，可以继续生成总结文字。
        // 没有这个 execute，AI SDK v6 会报 "Tool result is missing"。
        execute: async ({ pageNumber, exactText, reason }) => {
          return {
            success: true,
            pageNumber,
            exactText,
            reason,
            message: `已成功跳转到第 ${pageNumber} 页并高亮"${exactText.slice(0, 20)}..."`,
          };
        },
      }),
    },
    // 允许多步：模型调完工具后再生成一段总结性文字
    stopWhen: stepCountIs(3),
    // 把流过程中发生的错误打到服务端控制台，便于排查
    onError: ({ error }) => {
      console.error("[chat/route] streamText error:", error);
    },
    // 流结束后按 token 用量扣费
    onFinish: async ({ usage }) => {
      try {
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        const cost = estimateCostMicroCents(inputTokens, outputTokens);
        if (cost > 0) {
          await deductCost(user.userId, cost);
          console.log(
            `[chat] user=${user.username} input=${inputTokens} output=${outputTokens} cost=${cost}μ¢`
          );
        }
      } catch (e) {
        // 扣费失败不能让用户感知到错误，但要记日志便于补偿
        console.error("[chat] deductCost failed:", e);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    // 把真实错误信息透传给前端，方便定位问题（开发阶段）
    onError: (error) => {
      if (error == null) return "未知错误";
      if (typeof error === "string") return error;
      if (error instanceof Error) return error.message;
      try {
        return JSON.stringify(error);
      } catch {
        return "未知错误";
      }
    },
  });
}
