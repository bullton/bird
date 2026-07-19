import { db, schema } from '../db/client.js';
import { and, eq, sql } from 'drizzle-orm';
import { processIdentify } from './jobs/identify.js';
import { processRegenerateDescription } from './jobs/regenerate-description.js';

let interval: NodeJS.Timeout | null = null;
let busy = false;

const POLL_INTERVAL_MS = 1000;

export function startTaskWorker() {
  if (interval) return;
  recoverRunningTasks();
  interval = setInterval(tick, POLL_INTERVAL_MS);
  console.log('[worker] task worker started');
}

export function stopTaskWorker() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

function recoverRunningTasks() {
  const updated = db
    .update(schema.taskQueue)
    .set({ status: 'queued', startedAt: null })
    .where(eq(schema.taskQueue.status, 'running'))
    .run();
  if (updated.changes > 0) {
    console.log(`[worker] recovered ${updated.changes} running tasks back to queued`);
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    await pollOnce();
  } catch (err) {
    console.error('[worker] tick error:', err);
  } finally {
    busy = false;
  }
}

async function pollOnce() {
  let task: (typeof schema.taskQueue.$inferSelect) | null = null;

  try {
    db.run(sql`BEGIN IMMEDIATE`);
  } catch {
    return;
  }

  try {
    const row = db
      .select()
      .from(schema.taskQueue)
      .where(
        and(
          eq(schema.taskQueue.status, 'queued'),
          sql`${schema.taskQueue.scheduledAt} <= datetime('now')`
        )
      )
      .orderBy(sql`${schema.taskQueue.scheduledAt} asc`)
      .limit(1)
      .get();

    if (!row) {
      db.run(sql`ROLLBACK`);
      return;
    }

    db.update(schema.taskQueue)
      .set({
        status: 'running',
        startedAt: sql`datetime('now')`,
        attempts: row.attempts + 1,
      })
      .where(eq(schema.taskQueue.id, row.id))
      .run();

    task = { ...row, attempts: row.attempts + 1 };
    db.run(sql`COMMIT`);
  } catch (err) {
    db.run(sql`ROLLBACK`);
    throw err;
  }

  if (!task) return;

  try {
    if (task.taskType === 'identify') {
      await processIdentify(task.sightingId, task.id);
    } else if (task.taskType === 'regenerate_description') {
      await processRegenerateDescription(task.sightingId, task.id);
    }
    db.update(schema.taskQueue)
      .set({ status: 'done', finishedAt: sql`datetime('now')` })
      .where(eq(schema.taskQueue.id, task.id))
      .run();
  } catch (err: any) {
    const maxRetries = getMaxRetries();
    if (task.attempts < maxRetries) {
      const backoff = Math.pow(2, task.attempts) * 10;
      db.update(schema.taskQueue)
        .set({
          status: 'queued',
          lastError: String(err?.message ?? err).slice(0, 500),
          scheduledAt: sql`datetime('now', '+' || ${backoff} || ' seconds')`,
        })
        .where(eq(schema.taskQueue.id, task.id))
        .run();
      console.warn(`[worker] task ${task.id} failed (attempt ${task.attempts}/${maxRetries}), retry in ${backoff}s:`, err?.message);
    } else {
      db.update(schema.taskQueue)
        .set({ status: 'failed', lastError: String(err?.message ?? err).slice(0, 500) })
        .where(eq(schema.taskQueue.id, task.id))
        .run();
      db.update(schema.sightings)
        .set({ status: 'failed' })
        .where(eq(schema.sightings.id, task.sightingId))
        .run();
      console.error(`[worker] task ${task.id} permanently failed after ${task.attempts} attempts:`, err?.message);
    }
  }
}

function getMaxRetries(): number {
  const row = db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, 'ai_max_retries'))
    .get();
  return parseInt(row?.value ?? '3', 10);
}
