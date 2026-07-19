import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { attachUser, requireAdmin, requireAuth, requireMember } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { sightingRoutes } from './routes/sightings.js';
import { speciesRoutes } from './routes/species.js';
import { settingsRoutes } from './routes/settings.js';
import { statsRoutes } from './routes/stats.js';
import { db, schema } from './db/client.js';
import { eq } from 'drizzle-orm';
import { startTaskWorker, stopTaskWorker } from './services/task-worker.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: ReturnType<typeof requireAuth>;
    requireMember: ReturnType<typeof requireMember>;
    requireAdmin: ReturnType<typeof requireAdmin>;
  }
}

async function ensureDirectories() {
  for (const dir of [
    path.dirname(config.dbPath),
    config.photosDir,
    path.join(config.photosDir, 'originals'),
    path.join(config.photosDir, 'main'),
    path.join(config.photosDir, 'ai'),
    path.join(config.photosDir, 'thumbs'),
  ]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

async function recoverRunningTasks() {
  const updated = db.update(schema.taskQueue)
    .set({ status: 'queued', startedAt: null })
    .where(eq(schema.taskQueue.status, 'running'))
    .run();
  if (updated.changes > 0) {
    console.log(`Recovered ${updated.changes} running tasks back to queued`);
  }
}

export async function buildApp() {
  await ensureDirectories();

  const app = Fastify({
    logger: {
      level: config.isProd ? 'info' : 'debug',
    },
    bodyLimit: config.uploadMaxBytes + 1024 * 1024,
  });

  await app.register(fastifyCors, {
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  });

  await app.register(fastifyCookie, {
    secret: config.jwtSecret,
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'birdlog_token', signed: false },
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: config.uploadMaxBytes, files: 20 },
  });

  await app.register(fastifyStatic, {
    root: path.resolve(config.photosDir),
    prefix: '/photos/',
    decorateReply: false,
  });

  if (config.staticDir && existsSync(config.staticDir)) {
    await app.register(fastifyStatic, {
      root: path.resolve(config.staticDir),
      prefix: '/',
      wildcard: false,
      index: ['index.html'],
    });
    console.log(`Serving static from ${config.staticDir}`);
  }

  app.decorate('requireAuth', requireAuth());
  app.decorate('requireMember', requireMember());
  app.decorate('requireAdmin', requireAdmin());

  app.addHook('preHandler', attachUser);

  app.get('/api/health', async () => ({ ok: true, version: '0.1.0' }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(sightingRoutes);
  await app.register(speciesRoutes);
  await app.register(settingsRoutes);
  await app.register(statsRoutes);

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not Found' });
    }
    if (config.staticDir && existsSync(path.join(config.staticDir, 'index.html'))) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    if (reply.sent) return;
    const status = err.statusCode ?? 500;
    reply.code(status).send({
      error: err.message ?? 'Internal Server Error',
      code: err.code,
    });
  });

  return app;
}

async function main() {
  await ensureDirectories();
  await recoverRunningTasks();

  const app = await buildApp();

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`BirdLog started on http://${config.host}:${config.port}`);
    startTaskWorker();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down…`);
    stopTaskWorker();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Auto-start when this module is the entry point
const argv1 = process.argv[1] ?? '';
const isMain =
  import.meta.url === `file://${argv1}` ||
  import.meta.url.endsWith(argv1.replace(/\\/g, '/')) ||
  process.env.BIRDLOG_AUTOSTART === '1';

if (isMain) {
  main();
}