// middleware/clientChatGuard.js
// Middleware de seguridad específico para chat de clientes
// Filtra mensajes peligrosos sin falsos positivos, solo para clientes

const jwt = require('jsonwebtoken');
const { logSecurityEvent } = require('./auditLogger');
const { getClientIP } = require('./clientIp');

// Configuración
const CLIENT_CHAT_CONFIG = {
  maxMessageLength: 2000, // máximo 2000 caracteres
  maxWords: 300, // máximo 300 palabras
  blockSuspiciousPatterns: true,
  maxRequestsPerMinute: 20, // máximo 20 mensajes por minuto por usuario
  blockRepeatMessages: true, // bloquear mensajes repetidos
  cooldownPeriod: 2000 // 2 segundos entre mensajes del mismo usuario
};

// Almacenamiento en memoria para rate limiting por usuario
const userMessageHistory = new Map();
const lastMessageTime = new Map();

// Patrones de ataque específicos para chat (más restrictivos que el WAF general)
const CHAT_ATTACK_PATTERNS = [
  // Inyección de prompts (prompt injection) - SOLO patrones muy obvios y peligrosos
  /ignore\s+(all\s+)?previous\s+instructions\s+and\s+(show|reveal|display|print|output)\s+(your|the)\s+(system\s+prompt|instructions|context)/i,
  /forget\s+(all\s+)?previous\s+instructions\s+and\s+(show|reveal|display|print|output)\s+(your|the)\s+(system\s+prompt|instructions|context)/i,
  /disregard\s+(all\s+)?previous\s+instructions\s+and\s+(show|reveal|display|print|output)\s+(your|the)\s+(system\s+prompt|instructions|context)/i,
  /override\s+(all\s+)?previous\s+instructions\s+and\s+(show|reveal|display|print|output)\s+(your|the)\s+(system\s+prompt|instructions|context)/i,
  /new\s+(role|persona|character|identity)\s*:\s*(hacker|attacker|malicious|evil)\s+and\s+(help|assist|enable|perform)/i,
  /act\s+as\s+(a\s+)?(hacker|attacker|malicious|evil)\s+and\s+(help|assist|enable|perform)/i,
  /you\s+are\s+now\s+(a\s+)?(hacker|attacker|malicious|evil)\s+and\s+(help|assist|enable|perform)/i,
  /system\s*:\s*ignore\s+all\s+and\s+(show|reveal|display|print|output)/i,
  
  // Exfiltración de datos - SOLO cuando solicitan explícitamente información del sistema
  /print\s+(all\s+)?(your|the)\s+(instructions|system\s+prompt|context)\s+verbatim/i,
  /show\s+(me\s+)?your\s+(instructions|system\s+prompt|context)\s+verbatim/i,
  /reveal\s+(your\s+)?(instructions|system\s+prompt|context)\s+verbatim/i,
  /what\s+are\s+your\s+(exact|specific)\s+instructions/i,
  /what\s+is\s+your\s+(exact|specific)\s+system\s+prompt/i,
  
  // Bypass de restricciones - SOLO cuando intentan explícitamente bypass
  /bypass\s+(all\s+)?(restrictions|rules|filters)\s+and\s+(help|assist|enable|perform)/i,
  /circumvent\s+(all\s+)?(restrictions|rules|filters)\s+and\s+(help|assist|enable|perform)/i,
  /disable\s+(all\s+)?(restrictions|rules|filters)\s+and\s+(help|assist|enable|perform)/i,
  
  // Ataques de jailbreak conocidos - SOLO los comandos específicos de jailbreak
  /\bDAN\s+mode\s+enable/i,
  /\bdeveloper\s+mode\s+enable/i,
  /\bjailbreak\s+mode\s+enable/i,
  /\bunrestricted\s+mode\s+enable/i,
  /\babove\s+the\s+law\s+mode/i,
  
  // Caracteres peligrosos excesivos (posible ataque)
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  
  // Nuevos patrones de ataque más sofisticados - SOLO patrones muy específicos de hacking
  /tell\s+me\s+how\s+to\s+(hack|attack|exploit|bypass|steal|break\s+into)\s+(a\s+)?(system|network|database|server|bank\s+account|credit\s+card)/i,
  /explain\s+how\s+to\s+(hack|attack|exploit|bypass|steal|break\s+into)\s+(a\s+)?(system|network|database|server|bank\s+account|credit\s+card)/i,
  /generate\s+(malicious|virus|malware|exploit|payload)\s+(code|script|program)/i,
  /help\s+me\s+(hack|attack|exploit|steal|break\s+into)\s+(a\s+)?(system|network|database|server|bank\s+account|credit\s+card)/i,
  /write\s+(code|script)\s+to\s+(hack|attack|exploit|bypass|steal)\s+(a\s+)?(system|network|database|server|bank\s+account|credit\s+card)/i,
  /create\s+(code|script)\s+that\s+(hack|attack|exploit|bypass|steal)\s+(a\s+)?(system|network|database|server|bank\s+account|credit\s+card)/i,
  /\$\{.*\}/i, // Template injection
  /__proto__/i, // Prototype pollution
  /constructor/i, // Constructor pollution
  /prototype/i, // Prototype pollution
  /this\[.*\]/i, // Property access
  /\.\.\/\.\//i, // Path traversal
  /<iframe/i,
  /<embed/i,
  /<object/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
  /system\s*\(/i,
  /require\s*\(/i,
  /import\s*\(/i,
];

// Función para validar longitud del mensaje
function validateMessageLength(message) {
  if (message.length > CLIENT_CHAT_CONFIG.maxMessageLength) {
    return {
      valid: false,
      reason: 'MESSAGE_TOO_LONG',
      message: `El mensaje excede el máximo de ${CLIENT_CHAT_CONFIG.maxMessageLength} caracteres`
    };
  }
  
  const wordCount = message.trim().split(/\s+/).length;
  if (wordCount > CLIENT_CHAT_CONFIG.maxWords) {
    return {
      valid: false,
      reason: 'TOO_MANY_WORDS',
      message: `El mensaje excede el máximo de ${CLIENT_CHAT_CONFIG.maxWords} palabras`
    };
  }
  
  return { valid: true };
}

// Función para verificar cooldown entre mensajes
function checkCooldown(userId) {
  const now = Date.now();
  const lastTime = lastMessageTime.get(userId);
  
  if (lastTime && (now - lastTime) < CLIENT_CHAT_CONFIG.cooldownPeriod) {
    return {
      valid: false,
      reason: 'COOLDOWN_ACTIVE',
      message: `Por favor, espera ${Math.ceil((CLIENT_CHAT_CONFIG.cooldownPeriod - (now - lastTime)) / 1000)} segundos antes de enviar otro mensaje`
    };
  }
  
  lastMessageTime.set(userId, now);
  return { valid: true };
}

// Función para verificar mensajes repetidos
function checkRepeatMessages(userId, message) {
  if (!CLIENT_CHAT_CONFIG.blockRepeatMessages) return { valid: true };
  
  const history = userMessageHistory.get(userId) || [];
  const normalizedMessage = message.toLowerCase().trim();
  
  // Verificar si el mensaje es similar a los últimos 5 mensajes
  const recentMessages = history.slice(-5);
  for (const recentMsg of recentMessages) {
    const similarity = calculateSimilarity(normalizedMessage, recentMsg.toLowerCase().trim());
    if (similarity > 0.85) { // 85% de similitud
      return {
        valid: false,
        reason: 'REPEAT_MESSAGE',
        message: 'Por favor, evita enviar mensajes repetidos'
      };
    }
  }
  
  // Agregar mensaje al historial
  history.push(message);
  if (history.length > 20) history.shift(); // Mantener solo los últimos 20 mensajes
  userMessageHistory.set(userId, history);
  
  return { valid: true };
}

// Función para calcular similitud entre strings (algoritmo simple)
function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1;
  
  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  
  return 1 - costs[shorter.length] / longer.length;
}

// Función para verificar rate limiting por usuario
function checkUserRateLimit(userId) {
  const now = Date.now();
  const history = userMessageHistory.get(userId) || [];
  
  // Filtrar mensajes del último minuto
  const recentMessages = history.filter(timestamp => now - timestamp < 60000);
  
  if (recentMessages.length >= CLIENT_CHAT_CONFIG.maxRequestsPerMinute) {
    return {
      valid: false,
      reason: 'RATE_LIMIT_EXCEEDED',
      message: `Has excedido el límite de ${CLIENT_CHAT_CONFIG.maxRequestsPerMinute} mensajes por minuto`
    };
  }
  
  return { valid: true };
}

// Función para detectar patrones de ataque en el chat
function detectChatAttackPatterns(message) {
  if (!CLIENT_CHAT_CONFIG.blockSuspiciousPatterns) {
    return null;
  }
  
  for (const pattern of CHAT_ATTACK_PATTERNS) {
    if (pattern.test(message)) {
      return {
        type: 'CHAT_ATTACK_PATTERN',
        pattern: pattern.toString(),
        detected: true
      };
    }
  }
  
  return null;
}

// Middleware principal para chat de clientes
const clientChatGuard = (req, res, next) => {
  // Solo aplicar a endpoints de chat
  if (!req.path.startsWith('/api/chat')) {
    return next();
  }
  
  const { message } = req.body;
  
  // Verificar el rol del usuario
  let role = null;
  let userId = null;
  const authHeader = req.headers['authorization'];
  
  console.log('[clientChatGuard] Auth header:', authHeader ? 'Present' : 'Missing');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      role = decoded.role || null;
      userId = decoded.id || null;
      console.log('[clientChatGuard] Decoded role:', role, 'User ID:', userId);
    } catch (error) {
      // Token inválido, continuar como no autenticado
      console.log('[clientChatGuard] Token verification failed:', error.message);
      role = null;
      userId = null;
    }
  } else {
    // No hay token - usuario no autenticado (esto es válido para el chatbot)
    console.log('[clientChatGuard] No token - continuing as unauthenticated user');
    role = null;
    userId = null;
  }
  
  // Usar IP como identificador para usuarios no autenticados
  const { getClientIP } = require('./clientIp');
  const identifier = userId || getClientIP(req);
  
  // Si el usuario es repostero, solo sanitización básica
  if (role === 'repostero') {
    const sanitizedMessage = message
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // caracteres de control
      .trim();
    req.body.message = sanitizedMessage;
    return next();
  }
  
  // Para clientes y no autenticados: validación completa de seguridad
  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      error: 'Invalid message',
      message: 'El mensaje es requerido y debe ser texto'
    });
  }
  
  // Permitir que usuarios no autenticados usen el chat (solo rate limiting y sanitización)
  if (!role) {
    console.log('[clientChatGuard] Unauthenticated user - applying basic validation only');
  }
  
  // Validación de longitud
  const lengthValidation = validateMessageLength(message);
  if (!lengthValidation.valid) {
    return res.status(400).json({
      error: lengthValidation.reason,
      message: lengthValidation.message
    });
  }
  
  // Verificar cooldown entre mensajes
  const cooldownCheck = checkCooldown(identifier);
  if (!cooldownCheck.valid) {
    return res.status(429).json({
      error: cooldownCheck.reason,
      message: cooldownCheck.message
    });
  }
  
  // Verificar mensajes repetidos
  const repeatCheck = checkRepeatMessages(identifier, message);
  if (!repeatCheck.valid) {
    return res.status(400).json({
      error: repeatCheck.reason,
      message: repeatCheck.message
    });
  }
  
  // Verificar rate limiting por usuario
  const rateLimitCheck = checkUserRateLimit(identifier);
  if (!rateLimitCheck.valid) {
    return res.status(429).json({
      error: rateLimitCheck.reason,
      message: rateLimitCheck.message
    });
  }
  
  // Detección de patrones de ataque (prompt injection, jailbreak, etc.)
  const attackPattern = detectChatAttackPatterns(message);
  if (attackPattern) {
    console.log('[clientChatGuard] Attack pattern detected:', attackPattern);
    logSecurityEvent(req, 'CHAT_ATTACK_PATTERN', 'HIGH', {
      message: 'Patrón de ataque detectado en mensaje de chat',
      pattern: attackPattern.pattern,
      userId: identifier
    });
    return res.status(400).json({
      error: 'CHAT_ATTACK_PATTERN',
      message: 'Tu mensaje contiene patrones que no están permitidos. Por favor, reformula tu consulta.'
    });
  }
  
  // Sanitización básica (solo caracteres de control)
  const sanitizedMessage = message
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // caracteres de control
    .trim();
  
  req.body.message = sanitizedMessage;
  
  console.log('[clientChatGuard] Validación de seguridad completada para:', role || 'no autenticado');
  next();
};

module.exports = {
  clientChatGuard,
  validateMessageLength,
  detectChatAttackPatterns,
  CLIENT_CHAT_CONFIG
};
