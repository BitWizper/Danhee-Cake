const { logAttack } = require('./attackLogger');
const { getClientIP } = require('./clientIp');

const state = {
  chatRequests: new Map(),
  chatBlocks: new Map()
};

const getUserKey = (req) => {
  const userId = req.user && req.user.id ? `user:${req.user.id}` : null;
  const ip = getClientIP(req);
  return userId || `ip:${ip}`;
};

const cleanupExpired = (map) => {
  const now = Date.now();
  for (const [key, value] of map.entries()) {
    if (value.expiresAt <= now) {
      map.delete(key);
    }
  }
};

const chatAbuseGuard = (req, res, next) => {
  // Eximir a reposteros del chat abuse guard
  if (req.user && req.user.role === 'repostero') {
    return next();
  }
  
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = 5;
  const key = getUserKey(req);
  const ip = getClientIP(req);

  cleanupExpired(state.chatRequests);
  cleanupExpired(state.chatBlocks);

  const blocked = state.chatBlocks.get(key);
  if (blocked && blocked.expiresAt > now) {
    logAttack(req, 'chat_abuse_blocked', { key, reason: 'blocked_ip_or_user' });
    return res.status(429).json({
      success: false,
      error_code: 'CHAT_RATE_LIMITED',
      message: 'Demasiadas peticiones al chat. Espera unos momentos.'
    });
  }
  if (blocked) {
    state.chatBlocks.delete(key);
  }

  const bucket = state.chatRequests.get(key) || { count: 0, expiresAt: now + windowMs };
  if (bucket.expiresAt <= now) {
    bucket.count = 0;
    bucket.expiresAt = now + windowMs;
  }

  bucket.count += 1;
  state.chatRequests.set(key, bucket);

  if (bucket.count >= limit) {
    state.chatBlocks.set(key, { expiresAt: now + 5 * 60 * 1000, ip });
    logAttack(req, 'chat_abuse_blocked', { key, reason: 'limit_exceeded' });
    return res.status(429).json({
      success: false,
      error_code: 'CHAT_RATE_LIMITED',
      message: 'Has excedido el límite de mensajes. Intenta de nuevo más tarde.'
    });
  }

  next();
};

module.exports = { chatAbuseGuard };
