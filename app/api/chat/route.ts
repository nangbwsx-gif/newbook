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
  // 根据 isFullSummary 切换模式：总结模式 vs 日常问答模式
  const systemPrompt = isFullSummary
    ? [
        "你是一个 PDF 阅读助手，负责帮用户总结一本书的核心内容。",
        bookTitle ? `当前需要总结的书是《${bookTitle}》。` : "",
        "",
        "===== 总结要求 =====",
        "用户要求你总结全文。请按以下结构输出：",
        "1. **书籍概览**：一句话概括这本书的主题。",
        "2. **核心观点**：列出 3-5 个最重要的观点或结论。",
        "3. **章节脉络**：按页码顺序简要梳理各章内容。",
        "4. **关键摘录**：从原文中摘录 2-3 段最有代表性的文字（注明页码）。",
        "5. **读后启示**：这本书对读者最有价值的地方。",
        "",
        "===== 回答风格 =====",
        "- 用中文回答，层次清晰，使用 Markdown 格式。",
        "- 每个部分都要引用原文中的具体页码。",
        "- 如果 PDF 内容不足（如文本提取不完整），诚实告知。",
        "- 不要编造原文中不存在的内容。",
        "",
        "===== 全书 PDF 内容 =====",
        pdfContext || "（文本提取失败）",
      ].join("\n")
    : [
        "你是一个 PDF 阅读助手，负责帮用户回答关于他们正在阅读的书的问题。",
        bookTitle ? `当前阅读的书是《${bookTitle}》。` : "",
        "",
        "===== 工作规则 =====",
        "1. 如果用户的问题是要『找到』『跳到』『定位』『在哪里讲了』某个概念、章节、段落或元素（如参考文献、目录、摘要、结论），",
        "   你必须调用 navigateAndHighlight 工具，而不是只用文字回答。",
        "2. 如果用户只是问『这本书在讲什么』『总结一下』等不需要定位的问题，",
        "   直接用自然语言回答即可，不需要调用工具。",
        "3. 你只看到了当前阅读页及其前后各 2 页的内容，并非全书。",
        "   如果用户的问题超出了你看到的文本范围，请如实告知用户：",
        "   『这个问题可能不在当前视口范围内，请翻到相关页面后我再帮你查看。』",
        "",
        "",
        "===== 调用 navigateAndHighlight 工具的规则 =====",
        "- pageNumber：必须是下面文本中实际出现的 [第 N 页] 标记里的 N。",
        "- exactText：从那一页的原文中**逐字复制** 8-30 字的连续文本，要求**足够独特**，",
        "  能在原文中唯一定位（含上下文，不要只给一个常见单词）。",
        "  好例子：'References (1) Smith, J.' 或 '参考文献 [1] 张伟,'",
        "  坏例子：仅给 'References' 或 '摘要'（这种短词容易在多处出现，导致高亮漂移）。",
        "  优先选包含具体词、数字、专有名词的片段。",
        "- reason：用一句中文告诉用户你为什么跳到这里。",
        "- 如果用户问的内容在抽取的文本里**完全找不到**，不要硬调工具，",
        "  改用文字回答说明情况（例如『PDF 文本超出我能读取的范围，请滚动到 XX 页查看』）。",
        "",
        "===== 回答风格 =====",
        "- 中文问题用中文回答，简洁直接，不要客套话。",
        "- 调用工具后，再用一句话告诉用户你做了什么。",
        "",
        "===== 当前视口内的 PDF 内容（第 N–M 页） =====",
        "这是用户当前阅读页及其前后共约 5 页的文本，并非全书。",
        "回答时请基于以下文本，超出范围的诚实告知用户翻页。",
        pdfContext || "（用户尚未打开 PDF 或文本提取失败）",
      ].join("\n");

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
