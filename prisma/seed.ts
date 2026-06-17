import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  const password = await bcrypt.hash("admin123", 10);

  const user = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password,
    },
  });

  console.log("✅ Seed done — 测试账号:", user.username, "/ admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
