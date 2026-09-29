import type { WebSocket } from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { logger } from "../logger.js";

type Client = {
  id: string;
  userId: string;
  socket: WebSocket;
};

class Hub {
  private clients = new Map<string, Client>();
  private byUser = new Map<string, Set<string>>();

  add(userId: string, socket: WebSocket): Client {
    const id = randomUUID();
    this.clients.set(id, { id, userId, socket });
    const set = this.byUser.get(userId) ?? new Set();
    set.add(id);
    this.byUser.set(userId, set);
    return { id, userId, socket };
  }

  remove(id: string) {
    const c = this.clients.get(id);
    if (!c) return;
    this.clients.delete(id);
    const set = this.byUser.get(c.userId);
    set?.delete(id);
    if (set && set.size === 0) this.byUser.delete(c.userId);
  }

  sendToUser(userId: string, payload: unknown) {
    const set = this.byUser.get(userId);
    if (!set) return;
    const data = JSON.stringify(payload);
    for (const id of set) {
      const c = this.clients.get(id);
      try {
        c?.socket.send(data);
      } catch (err) {
        logger.warn({ err }, "ws_send_failed");
      }
    }
  }

  async broadcastToConversation(conversationId: string, payload: unknown) {
    const members = await prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    for (const m of members) this.sendToUser(m.userId, payload);
  }

  userConnectionCount(userId: string): number {
    return this.byUser.get(userId)?.size ?? 0;
  }
}

export const hub = new Hub();
