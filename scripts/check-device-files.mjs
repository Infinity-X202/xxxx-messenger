import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const count = await p.deviceFile.count();
  console.log("device_files count:", count);
  const files = await p.deviceFile.findMany({ take: 5, orderBy: { createdAt: "desc" } });
  console.log(JSON.stringify(files, null, 2));
} finally {
  await p.$disconnect();
}
