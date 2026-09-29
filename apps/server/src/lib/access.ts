import { prisma } from "../db.js";
import { errors } from "../errors.js";

export async function assertMember(userId: string, conversationId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw errors.forbidden();
  return member;
}

export async function isBlockedEither(a: string, b: string): Promise<boolean> {
  const row = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { userId: a, blockedUserId: b },
        { userId: b, blockedUserId: a },
      ],
    },
  });
  return Boolean(row);
}

export async function assertNotBlocked(actorId: string, otherId: string) {
  if (await isBlockedEither(actorId, otherId)) throw errors.forbidden("User unavailable");
}
