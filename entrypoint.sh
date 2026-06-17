#!/bin/sh
set -e

echo "🚀 等待 PostgreSQL 就绪..."
# 用 pg_isready 检查 PostgreSQL 是否可用（postgres 是 docker-compose 的服务名）
until pg_isready -h postgres -U newbook; do
  echo "⏳ 等待数据库..."
  sleep 2
done
echo "✅ PostgreSQL 已就绪"

cd /app

echo "🚀 同步数据库结构..."
npx prisma db push --skip-generate 2>&1

echo "🌱 执行种子数据..."
npx tsx prisma/seed.ts 2>&1 || echo "⚠️  种子数据已存在或失败，跳过"

echo "✅ 启动应用..."
exec "$@"
