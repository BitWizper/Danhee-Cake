/**
 * Sliding-window rate limiter for frontend auth forms.
 * Mirrors server limits in server/src/middleware/rateLimiter.js
 */

export const AUTH_RATE_LIMITS = {
  login: {
    storageKey: 'auth_rl_login',
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    blockDuration: 15 * 60 * 1000,
    cooldownMs: 2000,
  },
  register: {
    storageKey: 'auth_rl_register',
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000,
    blockDuration: 60 * 60 * 1000,
    cooldownMs: 3000,
  },
};

const readData = (storageKey) => {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return { timestamps: [], blockedUntil: 0 };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.timestamps)) return { timestamps: [], blockedUntil: 0 };
    return data;
  } catch {
    return { timestamps: [], blockedUntil: 0 };
  }
};

const writeData = (storageKey, data) => {
  sessionStorage.setItem(storageKey, JSON.stringify(data));
};

export const getRateLimitStatus = ({ storageKey, maxAttempts, windowMs }) => {
  const now = Date.now();
  const data = readData(storageKey);

  if (data.blockedUntil > now) {
    return {
      blocked: true,
      blockedUntil: data.blockedUntil,
      remaining: 0,
      total: maxAttempts,
    };
  }

  const activeTimestamps = data.timestamps.filter((t) => now - t < windowMs);
  return {
    blocked: false,
    blockedUntil: 0,
    remaining: Math.max(0, maxAttempts - activeTimestamps.length),
    total: maxAttempts,
  };
};

export const checkAndRecordRateLimit = ({ storageKey, maxAttempts, windowMs, blockDuration }) => {
  const now = Date.now();
  const data = readData(storageKey);

  if (data.blockedUntil > now) {
    return { allowed: false, blockedUntil: data.blockedUntil, remaining: 0, total: maxAttempts };
  }

  data.timestamps = data.timestamps.filter((t) => now - t < windowMs);

  if (data.timestamps.length >= maxAttempts) {
    data.blockedUntil = now + blockDuration;
    writeData(storageKey, data);
    return { allowed: false, blockedUntil: data.blockedUntil, remaining: 0, total: maxAttempts };
  }

  data.timestamps.push(now);
  writeData(storageKey, data);
  return {
    allowed: true,
    blockedUntil: 0,
    remaining: maxAttempts - data.timestamps.length,
    total: maxAttempts,
  };
};

/** Sync local block when server returns 429 */
export const syncServerRateLimit = ({ storageKey, maxAttempts, windowMs, blockDuration }, retryAfterSec) => {
  const now = Date.now();
  const data = readData(storageKey);
  const blockMs = retryAfterSec ? retryAfterSec * 1000 : blockDuration;

  data.blockedUntil = now + blockMs;
  data.timestamps = data.timestamps.filter((t) => now - t < windowMs);
  while (data.timestamps.length < maxAttempts) {
    data.timestamps.push(now);
  }
  writeData(storageKey, data);
};

export const formatBlockTime = (ms) => {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  if (totalSec >= 3600) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.ceil((totalSec % 3600) / 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return s > 0 ? `${m}min ${s}s` : `${m}min`;
  }
  return `${totalSec}s`;
};
