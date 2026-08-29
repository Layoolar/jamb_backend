import cron from 'node-cron';
import { and, eq, lt, sql as raw } from 'drizzle-orm';
import { db } from './db/index.js';
import { matches } from './db/schema.js';

/**
 * Hourly cleanup. Deliberately not a queue — one statement per hour on a table
 * this size does not justify infrastructure.
 */
export function startCron(): void {
  cron.schedule('7 * * * *', async () => {
    try {
      const expired = await db
        .update(matches)
        .set({ status: 'expired' })
        .where(
          and(
            lt(matches.expiresAt, new Date()),
            raw`${matches.status} in ('awaiting_opponent', 'in_progress')`,
          ),
        )
        .returning({ id: matches.id });

      if (expired.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`expired ${expired.length} stale matches`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('match expiry job failed', err);
    }
  });
}
