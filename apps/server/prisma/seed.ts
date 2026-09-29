import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function hash(password: string) {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

async function main() {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 12) {
    console.log("Skipping seed: set SEED_USER_PASSWORD (min 12 chars, mixed case, number, symbol).");
    return;
  }
  const passwordHash = await hash(password);
  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: {
      username: "alice",
      email: "alice@example.com",
      passwordHash,
      displayName: "Alice",
      status: "active",
      emailVerifiedAt: new Date(),
    },
  });
  const bob = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: {
      username: "bob",
      email: "bob@example.com",
      passwordHash,
      displayName: "Bob",
      status: "active",
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Seeded users ${alice.username} and ${bob.username} (role=user). No admin account was created.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
