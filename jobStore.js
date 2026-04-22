/**
 * Simple in-memory job store.
 * For production, swap this with Redis:
 *
 *   import { createClient } from "redis";
 *   const redis = createClient({ url: process.env.REDIS_URL });
 *   await redis.connect();
 *
 *   export const jobStore = {
 *     set: (k, v) => redis.set(k, JSON.stringify(v), { EX: 3600 }),
 *     get: async (k) => { const v = await redis.get(k); return v ? JSON.parse(v) : null; },
 *   };
 */

const store = new Map();

export const jobStore = {
  set: (key, value) => store.set(key, value),
  get: (key) => store.get(key) ?? null,
  delete: (key) => store.delete(key),
  all: () => Object.fromEntries(store),
};
