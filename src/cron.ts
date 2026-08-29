import cron from 'node-cron';
import { and, eq, lt, sql as raw } from 'drizzle-orm';
import { db } from './db/index.js';
import { matches } from './db/schema.js';
import { fillStaleMatches } from './services/bot.js';

/**
 * Hourly cleanup. Deliberately not a queue — one statement per hour on a table
 * this size does not justify infrastructure.
 */
export function startCron(): void {
  // Give unclaimed duels a bot BEFORE the expiry sweep runs, so a player who
  // created a duel gets a result rather than a silently dead match.
  cron.schedule('3 * * * *', async () => {
    try {
      const filled = await fillStaleMatches();
      if (filled > 0) {
        // eslint-disable-next-line no-console
        console.log(`filled ${filled} stale duels with a bot opponent`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('bot fill job failed', err);
    }
  });

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
