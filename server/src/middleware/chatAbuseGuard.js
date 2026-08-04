const { logAttack } = require('./attackLogger');
const { getClientIP } = require('./clientIp');

// Importar validaciones de clientChatGuard
const { 
  validateMessageLength, 
  checkCooldown, 
  checkRepeatMessages, 
  checkUserRateLimit, 
  detectChatAttackPatterns 
} = require('./clientChatGuard');

const state = {
  chatRequests: new Map(),
  chatBlocks: new Map(),
  messageHistory: new Map(), // Para detectar mensajes repetidos
  lastMessageTime: new Map() // Para cooldown entre mensajes
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
  // Aplicar a todos los usuarios (incluidos reposteros) para prevenir abuso
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = 5;
  const key = getUserKey(req);
  const ip = getClientIP(req);
  const message = req.body?.message || '';

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

  // Validación 1: Longitud del mensaje
  const lengthValidation = validateMessageLength(message);
  if (!lengthValidation.valid) {
    logAttack(req, 'chat_message_too_long', { key, reason: lengthValidation.reason });
    return res.status(400).json({
      success: false,
      error_code: lengthValidation.reason,
      message: lengthValidation.message
    });
  }

  // Validación 2: Cooldown entre mensajes (2 segundos)
  const cooldownValidation = checkCooldown(key);
  if (!cooldownValidation.valid) {
    logAttack(req, 'chat_cooldown', { key, reason: cooldownValidation.reason });
    return res.status(429).json({
      success: false,
      error_code: cooldownValidation.reason,
      message: cooldownValidation.message
    });
  }

  // Validación 3: Mensajes repetidos
  const repeatValidation = checkRepeatMessages(key, message);
  if (!repeatValidation.valid) {
    logAttack(req, 'chat_repeat_message', { key, reason: repeatValidation.reason });
    return res.status(429).json({
      success: false,
      error_code: repeatValidation.reason,
      message: repeatValidation.message
    });
  }

  // Validación 4: Rate limit por usuario (20 mensajes/min)
  const rateLimitValidation = checkUserRateLimit(key);
  if (!rateLimitValidation.valid) {
    logAttack(req, 'chat_rate_limit', { key, reason: rateLimitValidation.reason });
    return res.status(429).json({
      success: false,
      error_code: rateLimitValidation.reason,
      message: rateLimitValidation.message
    });
  }

  // Validación 5: Patrones de ataque (prompt injection, jailbreak, etc.)
  const attackPattern = detectChatAttackPatterns(message);
  if (attackPattern) {
    logAttack(req, 'chat_attack_pattern', { key, pattern: attackPattern.pattern, type: attackPattern.type });
    return res.status(400).json({
      success: false,
      error_code: 'SUSPICIOUS_PATTERN',
      message: 'Tu mensaje contiene contenido sospechoso. Por favor reformula tu solicitud.'
    });
  }

  // Rate limit global existente
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
