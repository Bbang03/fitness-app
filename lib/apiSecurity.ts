import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export type ApiProtectionOptions = {
  name: string;
  limit: number;
  windowMs: number;
  dailyLimit?: number;
  dailyWindowMs?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type MemoryBucket = {
  timestamps: number[];
  touchedAt: number;
};

type RateLimitStore = Map<string, MemoryBucket>;

const DEFAULT_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_BUCKETS = 5_000;

const globalForApiSecurity = globalThis as typeof globalThis & {
  __fittrackApiRateLimitStore?: RateLimitStore;
};

const memoryStore =
  globalForApiSecurity.__fittrackApiRateLimitStore ?? new Map<string, MemoryBucket>();

globalForApiSecurity.__fittrackApiRateLimitStore = memoryStore;

function noStoreHeaders(extra: Record<string, string> = {}) {
  return {
    'Cache-Control': 'no-store',
    ...extra,
  };
}

function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: 'unauthorized',
      message: '로그인이 필요한 요청입니다.',
    },
    {
      status: 401,
      headers: noStoreHeaders({
        'WWW-Authenticate': 'Bearer',
      }),
    },
  );
}

function unavailableResponse() {
  return NextResponse.json(
    {
      error: 'auth_unavailable',
      message: '인증 서버를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.',
    },
    {
      status: 503,
      headers: noStoreHeaders(),
    },
  );
}

function rateLimitedResponse(result: RateLimitResult) {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((result.resetAt - Date.now()) / 1000),
  );

  return NextResponse.json(
    {
      error: 'rate_limited',
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: noStoreHeaders({
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      }),
    },
  );
}

function bearerToken(request: Request) {
  const value = request.headers.get('authorization')?.trim();
  if (!value) return null;

  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  return match?.[1] ?? '';
}

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

async function authenticatedUser(request: Request): Promise<
  | { status: 'authenticated'; user: User }
  | { status: 'unauthorized' }
  | { status: 'unavailable' }
> {
  if (!hasSupabaseConfig()) return { status: 'unavailable' };

  try {
    const client = await createClient();
    const token = bearerToken(request);
    const result = token
      ? await client.auth.getUser(token)
      : await client.auth.getUser();

    if (result.error || !result.data.user) {
      return { status: 'unauthorized' };
    }

    return {
      status: 'authenticated',
      user: result.data.user,
    };
  } catch (error) {
    // Authentication failures are deliberately fail-closed. Do not let a
    // provider/network exception turn an expensive route into a public one.
    console.warn('[api-security] authentication check failed', error);
    return { status: 'unavailable' };
  }
}

function clientAddress(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real = request.headers.get('x-real-ip')?.trim();
  const value = forwarded || real;

  if (!value || value.length > 128) return null;
  return value;
}

function pruneBucket(bucket: MemoryBucket, now: number, windowMs: number) {
  const cutoff = now - windowMs;
  let firstLive = 0;

  while (firstLive < bucket.timestamps.length && bucket.timestamps[firstLive] <= cutoff) {
    firstLive += 1;
  }

  if (firstLive > 0) bucket.timestamps.splice(0, firstLive);
  bucket.touchedAt = now;
}

function evictOldMemoryBuckets(now: number) {
  if (memoryStore.size < MAX_MEMORY_BUCKETS) return;

  let oldestKey: string | null = null;
  let oldestTouchedAt = Number.POSITIVE_INFINITY;

  for (const [key, bucket] of memoryStore) {
    if (bucket.touchedAt < oldestTouchedAt) {
      oldestTouchedAt = bucket.touchedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) memoryStore.delete(oldestKey);
  else if (now > 0) memoryStore.clear();
}

function memoryRateLimit(
  keys: string[],
  rules: RateLimitRule[],
  now = Date.now(),
): RateLimitResult {
  const states = rules.flatMap((rule) =>
    keys.map((key) => {
      const bucketKey = `${key}:${rule.windowMs}`;
      const bucket = memoryStore.get(bucketKey) ?? { timestamps: [], touchedAt: now };
      pruneBucket(bucket, now, rule.windowMs);
      return { bucketKey, bucket, rule };
    }),
  );

  const blocked = states.find(({ bucket, rule }) => bucket.timestamps.length >= rule.limit);
  if (blocked) {
    const resetAt = (blocked.bucket.timestamps[0] ?? now) + blocked.rule.windowMs;
    return {
      allowed: false,
      limit: blocked.rule.limit,
      remaining: 0,
      resetAt,
    };
  }

  for (const { bucketKey, bucket } of states) {
    evictOldMemoryBuckets(now);
    bucket.timestamps.push(now);
    bucket.touchedAt = now;
    memoryStore.set(bucketKey, bucket);
  }

  const shortest = states.reduce((current, state) => {
    const remaining = Math.max(0, state.rule.limit - state.bucket.timestamps.length);
    return remaining < current.remaining
      ? {
          remaining,
          limit: state.rule.limit,
          resetAt: (state.bucket.timestamps[0] ?? now) + state.rule.windowMs,
        }
      : current;
  }, {
    remaining: Number.POSITIVE_INFINITY,
    limit: rules[0]?.limit ?? 0,
    resetAt: now,
  });

  return {
    allowed: true,
    limit: shortest.limit,
    remaining: Number.isFinite(shortest.remaining) ? shortest.remaining : 0,
    resetAt: shortest.resetAt,
  };
}

function redisConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.RATE_LIMIT_REDIS_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.RATE_LIMIT_REDIS_TOKEN?.trim();

  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

async function redisRateLimit(
  keys: string[],
  rules: RateLimitRule[],
  now = Date.now(),
): Promise<RateLimitResult | null> {
  const config = redisConfig();
  if (!config) return null;

  try {
    const states: Array<{
      count: number;
      ttlSeconds: number;
      rule: RateLimitRule;
    }> = [];

    for (const rule of rules) {
      const ttlSeconds = Math.max(1, Math.ceil(rule.windowMs / 1000));
      for (const key of keys) {
        const redisKey = `fittrack:api-rate:${key}:${rule.windowMs}`;
        const response = await fetch(`${config.url}/pipeline`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            ['INCR', redisKey],
            ['EXPIRE', redisKey, ttlSeconds],
            ['TTL', redisKey],
          ]),
          signal: AbortSignal.timeout(1_500),
        });

        if (!response.ok) return null;
        const payload = (await response.json()) as Array<{ result?: unknown }>;
        const count = Number(payload?.[0]?.result);
        const ttl = Number(payload?.[2]?.result);
        if (!Number.isFinite(count) || !Number.isFinite(ttl)) return null;

        states.push({
          count,
          ttlSeconds: Math.max(1, ttl),
          rule,
        });
      }
    }

    const blocked = states.find(({ count, rule }) => count > rule.limit);
    if (blocked) {
      return {
        allowed: false,
        limit: blocked.rule.limit,
        remaining: 0,
        resetAt: now + blocked.ttlSeconds * 1000,
      };
    }

    const shortest = states.reduce((current, state) => {
      const remaining = Math.max(0, state.rule.limit - state.count);
      return remaining < current.remaining
        ? {
            remaining,
            limit: state.rule.limit,
            resetAt: now + state.ttlSeconds * 1000,
          }
        : current;
    }, {
      remaining: Number.POSITIVE_INFINITY,
      limit: rules[0]?.limit ?? 0,
      resetAt: now,
    });

    return {
      allowed: true,
      limit: shortest.limit,
      remaining: Number.isFinite(shortest.remaining) ? shortest.remaining : 0,
      resetAt: shortest.resetAt,
    };
  } catch (error) {
    // Redis is an optional deployment enhancement. Keep local protection if
    // the shared store is temporarily unavailable rather than failing open.
    console.warn('[api-security] shared rate-limit store unavailable', error);
    return null;
  }
}

export async function consumeRateLimit(
  keys: string[],
  rules: RateLimitRule[],
): Promise<RateLimitResult> {
  const normalizedKeys = [...new Set(keys.filter(Boolean))];
  const normalizedRules = rules.filter(
    (rule) => Number.isFinite(rule.limit) && rule.limit > 0 && rule.windowMs > 0,
  );

  if (!normalizedKeys.length || !normalizedRules.length) {
    return {
      allowed: true,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      resetAt: Date.now(),
    };
  }

  const shared = await redisRateLimit(normalizedKeys, normalizedRules);
  return shared ?? memoryRateLimit(normalizedKeys, normalizedRules);
}

export async function protectApiRoute(
  request: Request,
  options: ApiProtectionOptions,
): Promise<
  | { ok: true; user: User; rateLimit: RateLimitResult }
  | { ok: false; response: NextResponse }
> {
  const auth = await authenticatedUser(request);

  if (auth.status === 'unavailable') {
    return { ok: false, response: unavailableResponse() };
  }

  if (auth.status === 'unauthorized') {
    return { ok: false, response: unauthorizedResponse() };
  }

  const keys = [`${options.name}:user:${auth.user.id}`];
  const address = clientAddress(request);
  if (address) keys.push(`${options.name}:ip:${address}`);

  const rules: RateLimitRule[] = [
    {
      limit: options.limit,
      windowMs: options.windowMs,
    },
  ];

  if (options.dailyLimit) {
    rules.push({
      limit: options.dailyLimit,
      windowMs: options.dailyWindowMs ?? DEFAULT_DAILY_WINDOW_MS,
    });
  }

  const rateLimit = await consumeRateLimit(keys, rules);
  if (!rateLimit.allowed) {
    return { ok: false, response: rateLimitedResponse(rateLimit) };
  }

  return {
    ok: true,
    user: auth.user,
    rateLimit,
  };
}

/** Reset only the process-local buckets; useful for deterministic unit tests. */
export function resetRateLimitStore() {
  memoryStore.clear();
}
