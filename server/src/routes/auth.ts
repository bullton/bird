import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { eq, count } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../utils/password.js';

const COOKIE_NAME = 'birdlog_token';

const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(100),
  displayName: z.string().max(80).optional(),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { username, password, displayName } = parsed.data;

    const allowRow = db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, 'allow_registration'))
      .get();
    if (allowRow?.value !== '1') {
      return reply.code(403).send({ error: 'Registration is disabled' });
    }

    const userCount = db.select({ c: count() }).from(schema.users).get()?.c ?? 0;
    const role: 'admin' | 'member' = userCount === 0 ? 'admin' : 'member';
    const mustChangePassword = role === 'admin' ? 1 : 0;

    const exists = db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    if (exists) {
      return reply.code(409).send({ error: 'Username taken' });
    }

    const passwordHash = await hashPassword(password);
    const inserted = db
      .insert(schema.users)
      .values({
        username,
        passwordHash,
        displayName: displayName ?? username,
        role,
        mustChangePassword,
      })
      .returning({ id: schema.users.id, role: schema.users.role, mustChangePassword: schema.users.mustChangePassword })
      .get();

    const token = await reply.jwtSign({ sub: inserted.id }, { expiresIn: '30d' });
    reply.setCookie(COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 60 * 60 * 24 * 30,
    });

    return {
      id: inserted.id,
      role: inserted.role,
      mustChangePassword: !!inserted.mustChangePassword,
    };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input' });
    }
    const { username, password } = parsed.data;

    const row = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    if (!row || !row.isActive) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    const ok = await verifyPassword(password, row.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    db.update(schema.users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(schema.users.id, row.id))
      .run();

    const token = await reply.jwtSign({ sub: row.id }, { expiresIn: '30d' });
    reply.setCookie(COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 60 * 60 * 24 * 30,
    });

    return {
      id: row.id,
      username: row.username,
      role: row.role,
      mustChangePassword: !!row.mustChangePassword,
    };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' });
    const row = db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        role: schema.users.role,
        mustChangePassword: schema.users.mustChangePassword,
      })
      .from(schema.users)
      .where(eq(schema.users.id, req.user.id))
      .get();
    if (!row) return reply.code(401).send({ error: 'Unauthorized' });
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      mustChangePassword: !!row.mustChangePassword,
    };
  });

  app.post('/api/auth/change-password', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' });
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input' });
    }
    const { oldPassword, newPassword } = parsed.data;
    const row = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, req.user.id))
      .get();
    if (!row) return reply.code(401).send({ error: 'Unauthorized' });
    const ok = await verifyPassword(oldPassword, row.passwordHash);
    if (!ok) return reply.code(400).send({ error: '旧密码错误' });
    const passwordHash = await hashPassword(newPassword);
    db.update(schema.users)
      .set({ passwordHash, mustChangePassword: 0 })
      .where(eq(schema.users.id, row.id))
      .run();
    return { ok: true };
  });

  app.post('/api/auth/check-username', async (req, reply) => {
    const { username } = z.object({ username: z.string().min(1) }).parse(req.body);
    const row = db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    return { available: !row };
  });
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;