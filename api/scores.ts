import { Redis } from '@upstash/redis';
import { handleScores, type Store } from './_scoreboard.js';

/**
 * GET  /api/scores?mode=normal|cyberhard|daily[&day=YYYY-MM-DD]  top 50, one best run per player
 * POST /api/scores  { player, mode, day?, victory, sector, heat, timeMs, credits, weapon }
 * Storage: an Upstash Redis linked to the Vercel project (Marketplace). The integration injects
 * KV_REST_API_URL / KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
 */
function connect(): Store | null {
  const env = process.env;
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? (new Redis({ url, token }) as unknown as Store) : null;
}

let store: Store | null | undefined;
const handler = (req: Request) => handleScores(req, (store ??= connect()));

export const GET = handler;
export const POST = handler;
