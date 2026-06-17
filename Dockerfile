# ===== 构建阶段 =====
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y \
    openssl ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

RUN npx prisma generate

# 构建时需要 JWT_SECRET（Next.js 会在 "Collecting page data" 阶段读取）
ARG JWT_SECRET
ENV JWT_SECRET=$JWT_SECRET
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

# ===== 运行阶段 =====
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y \
    openssl ca-certificates postgresql-client \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制 standalone 产物
COPY --from=builder /app/.next/standalone ./

# 复制静态资源
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# 复制 Prisma schema + 生成的 client（standalone 模式下必需）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 复制 lib（seed.ts 依赖的模块）
COPY --from=builder /app/lib ./lib

# 安装运行时需要的 CLI 工具（prisma db push + tsx seed）
COPY --from=builder /app/package.json ./package.json
RUN npm install prisma tsx --omit=dev --ignore-scripts 2>&1 && \
    rm package.json

# 复制 entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 上传目录
RUN mkdir -p /app/public/uploads && \
    chown -R nextjs:nodejs /app

# 给 nextjs 用户一个可写的家目录（npx/npm 需要）
RUN mkdir -p /home/nextjs && chown nextjs:nodejs /home/nextjs
ENV HOME=/home/nextjs

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
