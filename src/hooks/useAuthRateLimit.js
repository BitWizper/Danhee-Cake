import { useState, useCallback, useEffect, useRef } from 'react';
import {
  AUTH_RATE_LIMITS,
  getRateLimitStatus,
  checkAndRecordRateLimit,
  syncServerRateLimit,
  formatBlockTime,
} from '../utils/rateLimiter';

export const useAuthRateLimit = (type) => {
  const config = AUTH_RATE_LIMITS[type];
  const [blocked, setBlocked] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [remaining, setRemaining] = useState(config.maxAttempts);
  const lastAttemptRef = useRef(0);
  const intervalRef = useRef(null);

  const clearCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCountdown = useCallback((blockedUntil) => {
    clearCountdown();

    const tick = () => {
      const msLeft = blockedUntil - Date.now();
      if (msLeft <= 0) {
        clearCountdown();
        setBlocked(false);
        setCountdown('');
        const status = getRateLimitStatus(config);
        setRemaining(status.remaining);
        return;
      }
      setCountdown(formatBlockTime(msLeft));
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
  }, [clearCountdown, config]);

  const refresh = useCallback(() => {
    const status = getRateLimitStatus(config);
    setBlocked(status.blocked);
    setRemaining(status.remaining);
    if (status.blocked) {
      startCountdown(status.blockedUntil);
    } else {
      clearCountdown();
      setCountdown('');
    }
    return status;
  }, [config, startCountdown, clearCountdown]);

  useEffect(() => {
    refresh();
    return clearCountdown;
  }, [refresh, clearCountdown]);

  const checkBeforeSubmit = useCallback(() => {
    const status = getRateLimitStatus(config);

    if (status.blocked) {
      startCountdown(status.blockedUntil);
      return {
        allowed: false,
        error: `Demasiados intentos. Espera ${formatBlockTime(status.blockedUntil - Date.now())} para continuar.`,
      };
    }

    const now = Date.now();
    if (now - lastAttemptRef.current < config.cooldownMs) {
      const secs = Math.ceil((config.cooldownMs - (now - lastAttemptRef.current)) / 1000);
      return { allowed: false, error: `Espera ${secs}s antes de intentar de nuevo.` };
    }

    return { allowed: true };
  }, [config, startCountdown]);

  const recordAttempt = useCallback(() => {
    lastAttemptRef.current = Date.now();
    const result = checkAndRecordRateLimit(config);
    setRemaining(result.remaining ?? 0);
    if (!result.allowed) {
      setBlocked(true);
      startCountdown(result.blockedUntil);
    }
    return result;
  }, [config, startCountdown]);

  const handleServer429 = useCallback((response) => {
    const retryAfter = response.headers.get('Retry-After');
    const resetHeader = response.headers.get('RateLimit-Reset');
    let retrySec = retryAfter ? parseInt(retryAfter, 10) : null;

    if (!retrySec && resetHeader) {
      const resetTime = parseInt(resetHeader, 10);
      if (!Number.isNaN(resetTime)) {
        retrySec = Math.max(1, resetTime - Math.floor(Date.now() / 1000));
      }
    }

    syncServerRateLimit(config, retrySec);
    refresh();
    const status = getRateLimitStatus(config);
    return `Demasiados intentos. Espera ${formatBlockTime(status.blockedUntil - Date.now())} para continuar.`;
  }, [config, refresh]);

  return {
    blocked,
    countdown,
    remaining,
    total: config.maxAttempts,
    checkBeforeSubmit,
    recordAttempt,
    handleServer429,
  };
};
