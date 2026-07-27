const { logAttack } = require('./attackLogger');
const { getClientIP } = require('./clientIp');

const state = {
  paymentRequests: new Map(),
  paymentBlocks: new Map()
};

const cleanupExpired = (map) => {
  const now = Date.now();
  for (const [key, value] of map.entries()) {
    if (value.expiresAt <= now) {
      map.delete(key);
    }
  }
};

const paymentGuard = (req, res, next) => {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const limit = 5;
  const ip = getClientIP(req);
  const key = `ip:${ip}`;

  cleanupExpired(state.paymentRequests);
  cleanupExpired(state.paymentBlocks);

  const blocked = state.paymentBlocks.get(key);
  if (blocked && blocked.expiresAt > now) {
    logAttack(req, 'payment_abuse_blocked', { key, reason: 'blocked_ip' });
    return res.status(429).json({
      success: false,
      error_code: 'PAYMENT_RATE_LIMITED',
      message: 'Demasiadas solicitudes de pago. Espera unos minutos.'
    });
  }
  if (blocked) {
    state.paymentBlocks.delete(key);
  }

  const bucket = state.paymentRequests.get(key) || { count: 0, expiresAt: now + windowMs };
  if (bucket.expiresAt <= now) {
    bucket.count = 0;
    bucket.expiresAt = now + windowMs;
  }

  bucket.count += 1;
  state.paymentRequests.set(key, bucket);

  if (bucket.count >= limit) {
    state.paymentBlocks.set(key, { expiresAt: now + 15 * 60 * 1000, ip });
    logAttack(req, 'payment_abuse_blocked', { key, reason: 'limit_exceeded' });
    return res.status(429).json({
      success: false,
      error_code: 'PAYMENT_RATE_LIMITED',
      message: 'Se ha bloqueado temporalmente esta IP por abuso en pagos.'
    });
  }

  next();
};

module.exports = { paymentGuard };
