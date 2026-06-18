# 📖 NewBook — 智能 PDF 阅读器

把你的 PDF 变成可以对话的书。上传文献、分类整理，内置 AI 助手一键定位、即时问答。

> 🟢 **在线体验**：https://linshupeng.asia  
> 🧪 **演示账号**：`admin` / `admin123`

---

## ✨ 功能介绍

### 📚 私人书橱
- 上传 PDF 文件（最大 50MB），自动生成封面预览
- 网格书架展示，木质隔板拟物风格
- 书名实时搜索，按分类过滤
- 重命名、移动分类、删除管理

### 🤖 AI 阅读助手
- 基于 **DeepSeek** 大模型，当前页 ± 12 页上下文（共 25 页）
- 问「参考文献在哪页」→ 自动跳转 + 高亮原文片段
- 问「解释一下这个公式」→ 基于 PDF 上下文即时回答
- 全文总结模式（25 页以内 PDF 一键生成结构化摘要）
- 注册即送 **1 元 AI 额度**（约可问答数百次）

### 📂 自定义分类
- 自由新建、重命名、删除分类
- 删除分类时书籍自动落入「未分类」，永不丢失
- 上传时直接选择归档分类

### 🔗 一键公开分享
- 开启分享 → 自动复制阅读链接 → 发给同事/导师
- 对方无需注册，即可在线阅读 PDF
- 随时取消公开，链接立即失效

### 🖥️ 阅读器功能
- 键盘翻页：`←` `→` 翻页，`+` `-` 缩放
- 日间/夜间模式切换
- PDF 目录大纲导航
- 自动保存阅读进度（防抖 1 秒）
- 移动端适配（触屏翻页 + 抽屉式侧边栏）

---

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **框架** | Next.js 14 (App Router) | SSR + API Routes |
| **UI** | React 18 + TailwindCSS 3 | 组件化 + Utility-first |
| **语言** | TypeScript 5.7 (strict) | 全量类型覆盖 |
| **状态管理** | Zustand 4 | 轻量客户端状态 |
| **ORM** | Prisma 5 | 数据模型 + 类型安全查询 |
| **数据库** | PostgreSQL 16 | 生产数据库 |
| **认证** | JWT（jose + bcryptjs） | httpOnly Cookie，7 天有效 |
| **PDF 渲染** | react-pdf 9 + pdfjs-dist 4 | Canvas 渲染 + 文本层提取 |
| **AI** | AI SDK v6 + DeepSeek | 流式对话 + 工具调用 |
| **样式工具** | tailwind-merge + clsx | 智能 className 合并 |
| **部署** | Docker + GitHub Actions | 自动 CI/CD |

---

## 🖥️ 服务器配置

| 项目 | 配置 |
|------|------|
| **云服务商** | 腾讯云轻量应用服务器 |
| **公网 IP** | `8.222.168.107` |
| **域名** | `linshupeng.asia`（Caddy 自动 HTTPS） |
| **CPU** | 2 核 |
| **内存** | 2 GB |
| **系统** | Ubuntu 22.04 |
| **反向代理** | Caddy（自动 Let's Encrypt 证书） |

### Docker 容器架构

```
┌─────────────────────────────────────────┐
│                 Docker                   │
│  ┌──────────┐  ┌───────┐  ┌──────────┐ │
│  │  Caddy   │  │  App  │  │PostgreSQL│ │
│  │  :80:443 │──│ :3000 │──│  :5432   │ │
│  └──────────┘  └───────┘  └──────────┘ │
│  反向代理+HTTPS  Next.js   数据库        │
└─────────────────────────────────────────┘
```

---

## 🚀 部署指南

### 方式一：GitHub Actions 自动部署（推荐）

Push 到 `master` 分支即自动触发：

1. GitHub Actions 构建 Docker 镜像
2. SCP 传输镜像到服务器
3. 写入 `.env.production` 环境变量
4. `docker compose up -d` 重启服务

**前置条件：** 在 GitHub Secrets 中配置：
- `SERVER_SSH_KEY` — 服务器 SSH 私钥
- `JWT_SECRET` — JWT 签名密钥（≥16 字符随机字符串）
- `DEEPSEEK_API_KEY` — DeepSeek API 密钥

### 方式二：手动部署

```bash
# 1. 克隆仓库
git clone https://github.com/nangbwsx-gif/newbook.git
cd newbook

# 2. 构建 Docker 镜像（需要传入 JWT_SECRET）
docker build --build-arg JWT_SECRET=your-secret-key -t newbook-app:latest .

# 3. 导出镜像
docker save newbook-app:latest | gzip > newbook-app.tar.gz

# 4. 传输到服务器
scp newbook-app.tar.gz docker-compose.deploy.yml Caddyfile root@8.222.168.107:/root/newbook/

# 5. 在服务器上创建 .env.production
ssh root@8.222.168.107 "cat > /root/newbook/.env.production << 'EOF'
DATABASE_URL=postgresql://newbook:newbook_pass@postgres:5432/newbook?schema=public
JWT_SECRET=your-secret-key
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
EOF"

# 6. 加载镜像并启动
ssh root@8.222.168.107 "cd /root/newbook && \
  docker load < newbook-app.tar.gz && \
  rm -f newbook-app.tar.gz && \
  docker compose up -d"
```

### 方式三：本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（创建 .env 文件）
cat > .env << 'EOF'
DATABASE_URL=postgresql://newbook:newbook_pass@localhost:5432/newbook
JWT_SECRET=your-dev-secret-key
DEEPSEEK_API_KEY=sk-your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
EOF

# 3. 启动 PostgreSQL（Docker）
docker run -d --name newbook-pg \
  -e POSTGRES_USER=newbook \
  -e POSTGRES_PASSWORD=newbook_pass \
  -e POSTGRES_DB=newbook \
  -p 5432:5432 \
  postgres:16-alpine

# 4. 同步数据库 + 种子数据
npm run db:push
npm run db:seed

# 5. 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

---

## 📁 项目结构

```
newbook/
├── app/                      # Next.js App Router 页面 + API 路由
│   ├── page.tsx              # 产品首页（公开）
│   ├── login/page.tsx        # 登录页
│   ├── register/page.tsx     # 注册页
│   ├── library/page.tsx      # 书橱主页（需登录）
│   ├── book/[id]/page.tsx    # PDF 阅读器页
│   └── api/                  # RESTful API
│       ├── auth/             # 登录/注册/登出/me
│       ├── books/            # 上传/列表/详情/删除/文件流
│       ├── categories/       # 分类 CRUD
│       └── chat/             # AI 聊天（DeepSeek 流式）
├── components/               # 共享 UI 组件
│   ├── PDFReader.tsx         # PDF 阅读器核心
│   ├── AIChatPanel.tsx       # AI 助手面板
│   ├── UploadDialog.tsx      # 上传弹窗
│   ├── BookCover.tsx         # PDF 封面渲染
│   ├── PageBackground.tsx    # 公共背景装饰
│   ├── Icons.tsx             # 共享 SVG 图标
│   └── ...
├── lib/                      # 工具库
│   ├── auth.ts               # JWT 签发/验证
│   ├── prisma.ts             # Prisma 客户端单例
│   ├── aiBudget.ts           # AI 费用（micro-cents）
│   ├── categories.ts         # 分类常量和校验
│   ├── extractPdfText.ts     # PDF 文本提取
│   ├── prompts.ts            # AI System Prompt 模板
│   ├── cn.ts                 # className 合并（tailwind-merge）
│   ├── pathTraversal.ts      # 路径遍历防护
│   ├── useShare.ts           # 分享逻辑 hook
│   └── ...
├── store/                    # Zustand 全局状态
│   ├── useAuthStore.ts       # 用户认证状态
│   └── useBookStore.ts       # 当前阅读状态
├── prisma/
│   ├── schema.prisma         # 数据模型定义
│   └── seed.ts               # 种子数据
├── middleware.ts             # 路由鉴权中间件
├── Dockerfile                # 多阶段构建
├── docker-compose.deploy.yml # 服务器部署编排
├── Caddyfile                 # 反向代理 + HTTPS
├── deploy.sh                 # 一键部署脚本
└── .github/workflows/
    └── deploy.yml            # GitHub Actions CI/CD
```

---

## 📡 API 概览

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | `/api/auth/register` | 注册新用户 | 否 |
| POST | `/api/auth/login` | 登录 | 否 |
| POST | `/api/auth/logout` | 登出 | 是 |
| GET  | `/api/auth/me` | 获取当前用户 | 否 |
| GET  | `/api/books` | 获取用户书橱 | 是 |
| POST | `/api/books` | 上传 PDF | 是 |
| GET  | `/api/books/[id]` | 书籍详情 | 公开/私密 |
| PATCH | `/api/books/[id]` | 更新书籍（进度/分类/公开） | 是 |
| DELETE | `/api/books/[id]` | 删除书籍 | 是 |
| GET  | `/api/books/[id]/file` | 流式获取 PDF 文件 | 公开/私密 |
| GET  | `/api/categories` | 获取分类列表 | 是 |
| POST | `/api/categories` | 创建分类 | 是 |
| PATCH | `/api/categories/[id]` | 重命名分类 | 是 |
| DELETE | `/api/categories/[id]` | 删除分类 | 是 |
| POST | `/api/chat` | AI 聊天（流式 SSE） | 是 |

---

## 📄 License

MIT
