import type { FastifyReply, FastifyRequest } from 'fastify';
import { db, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'member';
  mustChangePassword: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export async function attachUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify<{ sub: number }>();
    const payload = req.user as { sub: number } | undefined;
    const userId = payload?.sub ?? (req as any).user?.id;
    if (!userId) return;
    const row = db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.users.role,
        isActive: schema.users.isActive,
        mustChangePassword: schema.users.mustChangePassword,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();
    if (!row || !row.isActive) return;
    req.authUser = {
      id: row.id,
      username: row.username,
      role: row.role as 'admin' | 'member',
      mustChangePassword: !!row.mustChangePassword,
    };
  } catch {
    // 未登录或 token 无效，静默忽略
  }
}

export function requireAuth() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.authUser) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };
}

export function requireMember() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.authUser) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (req.authUser.mustChangePassword) {
      return reply.code(403).send({ error: 'Must change password first', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
  };
}

export function requireAdmin() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.authUser) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (req.authUser.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (req.authUser.mustChangePassword) {
      return reply.code(403).send({ error: 'Must change password first', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
  };
}