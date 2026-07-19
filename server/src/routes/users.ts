import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../utils/password.js';

const createUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(100),
  displayName: z.string().max(80).optional(),
  role: z.enum(['admin', 'member']),
});

const updateUserSchema = z.object({
  displayName: z.string().max(80).optional(),
  role: z.enum(['admin', 'member']).optional(),
  isActive: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(100),
});

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/users', { preHandler: app.requireAdmin }, async () => {
    const rows = db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        role: schema.users.role,
        isActive: schema.users.isActive,
        mustChangePassword: schema.users.mustChangePassword,
        createdAt: schema.users.createdAt,
        lastLoginAt: schema.users.lastLoginAt,
      })
      .from(schema.users)
      .all();
    return rows;
  });

  app.post('/api/users', { preHandler: app.requireAdmin }, async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    const { username, password, displayName, role } = parsed.data;
    const exists = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username)).get();
    if (exists) return reply.code(409).send({ error: 'Username taken' });
    const passwordHash = await hashPassword(password);
    const inserted = db.insert(schema.users).values({
      username,
      passwordHash,
      displayName: displayName ?? username,
      role,
      mustChangePassword: 1,
    }).returning({ id: schema.users.id }).get();
    return { id: inserted.id };
  });

  app.patch<{ Params: { id: string } }>('/api/users/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const target = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!target) return reply.code(404).send({ error: 'Not found' });

    const updates: Partial<typeof schema.users.$inferInsert> = {};
    if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName;
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive ? 1 : 0;

    if (target.role === 'admin' && parsed.data.role === 'member') {
      const adminCount = db.select().from(schema.users).where(eq(schema.users.role, 'admin')).all().length;
      if (adminCount <= 1) {
        return reply.code(400).send({ error: '系统至少保留一名管理员' });
      }
    }
    db.update(schema.users).set(updates).where(eq(schema.users.id, id)).run();
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/users/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    if (id === req.authUser!.id) return reply.code(400).send({ error: '不能删除自己' });
    const target = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!target) return reply.code(404).send({ error: 'Not found' });
    if (target.role === 'admin') {
      const adminCount = db.select().from(schema.users).where(eq(schema.users.role, 'admin')).all().length;
      if (adminCount <= 1) {
        return reply.code(400).send({ error: '系统至少保留一名管理员' });
      }
    }
    db.delete(schema.users).where(eq(schema.users.id, id)).run();
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/users/:id/reset-password', { preHandler: app.requireAdmin }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const target = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!target) return reply.code(404).send({ error: 'Not found' });
    const passwordHash = await hashPassword(parsed.data.newPassword);
    db.update(schema.users).set({ passwordHash, mustChangePassword: 1 }).where(eq(schema.users.id, id)).run();
    return { ok: true };
  });
}