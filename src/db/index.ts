import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProd } from '../env.js';
import * as schema from './schema.js';

/**
 * App and Postgres are co-located on one box (PLAN §11), so the pool can be
 * small and the connection cheap. `max` is deliberately modest: a duel is ~21
 * short round-trips, not long transactions.
 */
export const sql = postgres(env.DATABASE_URL, {
  max: isProd ? 20 : 5,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });

export type Db = typeof db;
export { schema };
