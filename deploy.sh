#!/bin/bash
set -e

# ============================================================
#  newbook 一键部署脚本
#  用法：
#    1. 先在本机（有 Docker 的电脑）运行此脚本
#    2. 在当前目录下需要 server_key 文件（SSH 私钥）
#
#  流程：
#    本地构建 Docker 镜像 → 压缩 → scp 传到服务器 → 加载启动
# ============================================================

# ========== ↓↓↓ 服务器配置 ↓↓↓ ==========

# 服务器 SSH 地址
SERVER="root@8.222.168.107"

# SSH 私钥文件路径（已放在项目目录下）
SSH_KEY="server_key"

# 服务器上存放项目的目录
REMOTE_DIR="/root/newbook"

# 镜像名称
IMAGE_NAME="newbook-app"
IMAGE_TAG="latest"

# ========== ↑↑↑ 配置结束 ↑↑↑ ==========

# SSH 通用参数
SSH_CMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
SCP_CMD="scp -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  newbook 一键部署（本地构建 → 服务器运行）${NC}"
echo -e "${YELLOW}========================================${NC}"

# ---- 检查依赖 ----
echo ""
echo -e "${GREEN}[1/6] 检查本地依赖...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ 本地未安装 Docker${NC}"
    echo "   请安装 Docker Desktop：https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v scp &> /dev/null; then
    echo -e "${RED}❌ 本地未安装 scp${NC}"
    echo "   请安装 OpenSSH 客户端（Windows 可在 设置 > 应用 > 可选功能 中添加）"
    exit 1
fi

if [ ! -f "${SSH_KEY}" ]; then
    echo -e "${RED}❌ 找不到 SSH 密钥文件: ${SSH_KEY}${NC}"
    echo "   请确保 server_key 文件在当前目录下"
    exit 1
fi

chmod 600 ${SSH_KEY}
echo "   ✅ Docker: $(docker --version 2>&1 | head -1)"
echo "   ✅ scp: 已安装"
echo "   ✅ SSH 密钥: ${SSH_KEY}"

# ---- 本地构建 Docker 镜像 ----
echo ""
echo -e "${GREEN}[2/6] 本地构建 Docker 镜像...${NC}"
echo "   镜像名称: ${IMAGE_NAME}:${IMAGE_TAG}"
echo -e "${YELLOW}   ⚠ 这个步骤最耗时间（可能需要 3-10 分钟）${NC}"

docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

echo "   ✅ 构建完成"

# ---- 压缩镜像 ----
echo ""
echo -e "${GREEN}[3/6] 压缩镜像...${NC}"

ARCHIVE="${IMAGE_NAME}.tar.gz"
docker save ${IMAGE_NAME}:${IMAGE_TAG} | gzip > ${ARCHIVE}

SIZE=$(du -h ${ARCHIVE} | cut -f1)
echo "   ✅ 压缩完成，大小: ${SIZE}"

# ---- 检查服务器连接 ----
echo ""
echo -e "${GREEN}[4/6] 检查服务器连接...${NC}"

if ! ${SSH_CMD} ${SERVER} "echo connected" 2>/dev/null; then
    echo -e "${RED}❌ 无法连接到服务器 ${SERVER}${NC}"
    echo "   请检查："
    echo "     1. 服务器 IP 是否正确"
    echo "     2. SSH 密钥是否匹配"
    echo "     3. 服务器是否已开机"
    rm -f ${ARCHIVE}
    exit 1
fi
echo "   ✅ 服务器连接正常"

# ---- 传输文件到服务器 ----
echo ""
echo -e "${GREEN}[5/6] 传输文件到服务器...${NC}"

# 在服务器上创建目录
${SSH_CMD} ${SERVER} "mkdir -p ${REMOTE_DIR}"

# 传输镜像压缩包
echo "   传输镜像文件（${SIZE}）..."
${SCP_CMD} ${ARCHIVE} ${SERVER}:${REMOTE_DIR}/

# 传输 docker-compose 部署文件（命名为 docker-compose.yml）
echo "   传输 docker-compose 配置..."
${SCP_CMD} docker-compose.deploy.yml ${SERVER}:${REMOTE_DIR}/docker-compose.yml

echo "   ✅ 传输完成"

# ---- 在服务器上加载并启动 ----
echo ""
echo -e "${GREEN}[6/6] 在服务器上加载镜像并启动...${NC}"

${SSH_CMD} ${SERVER} "cd ${REMOTE_DIR} && \
    echo '   加载镜像...' && \
    docker load < ${ARCHIVE} && \
    rm -f ${ARCHIVE} && \
    echo '   启动容器...' && \
    docker compose up -d && \
    echo '' && \
    echo '   ✅ 服务已启动！'" || {
    echo -e "${RED}❌ 启动失败，查看日志:${NC}"
    ${SSH_CMD} ${SERVER} "cd ${REMOTE_DIR} && docker compose logs --tail 50"
    exit 1
}

# ---- 清理本地临时文件 ----
rm -f ${ARCHIVE}

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ 部署完成！${NC}"
echo -e "${GREEN}  访问地址: http://8.222.168.107:3000${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "常用命令："
echo "  查看状态:  ssh -i ${SSH_KEY} root@8.222.168.107 'cd ${REMOTE_DIR} && docker compose ps'"
echo "  查看日志:  ssh -i ${SSH_KEY} root@8.222.168.107 'cd ${REMOTE_DIR} && docker compose logs -f'"
echo "  重启服务:  ssh -i ${SSH_KEY} root@8.222.168.107 'cd ${REMOTE_DIR} && docker compose restart'"
echo "  停止服务:  ssh -i ${SSH_KEY} root@8.222.168.107 'cd ${REMOTE_DIR} && docker compose down'"
echo "  数据库管理: ssh -i ${SSH_KEY} root@8.222.168.107 'cd ${REMOTE_DIR} && docker compose exec postgres psql -U newbook newbook'"
echo "  更新部署:  重新运行 bash deploy.sh"
