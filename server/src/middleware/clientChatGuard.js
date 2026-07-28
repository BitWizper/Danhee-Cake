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
  // Inyección de prompts (prompt injection)
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /forget\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?previous\s+instructions/i,
  /override\s+(all\s+)?previous\s+instructions/i,
  /new\s+(role|persona|character|identity)/i,
  /act\s+as\s+(a\s+)?(hacker|attacker|malicious|evil)/i,
  /you\s+are\s+now/i,
  /system\s*:\s*ignore/i,
  
  // Exfiltración de datos
  /print\s+(all\s+)?(your|the)\s+(instructions|system\s+prompt|context)/i,
  /show\s+(me\s+)?your\s+(instructions|system\s+prompt|context)/i,
  /reveal\s+(your\s+)?(instructions|system\s+prompt|context)/i,
  /what\s+are\s+your\s+instructions/i,
  /what\s+is\s+your\s+system\s+prompt/i,
  
  // Bypass de restricciones
  /bypass\s+(all\s+)?(restrictions|rules|filters)/i,
  /circumvent\s+(all\s+)?(restrictions|rules|filters)/i,
  /disable\s+(all\s+)?(restrictions|rules|filters)/i,
  
  // Ataques de jailbreak conocidos
  /DAN\s+mode/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /unrestricted\s+mode/i,
  /above\s+the\s+law/i,
  
  // Caracteres peligrosos excesivos (posible ataque)
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  
  // Nuevos patrones de ataque más sofisticados
  /tell\s+me\s+how\s+to/i,
  /explain\s+how\s+to\s+(hack|attack|exploit|bypass)/i,
  /generate\s+(malicious|virus|malware|exploit)/i,
  /help\s+me\s+(hack|attack|exploit)/i,
  /write\s+(code|script)\s+to/i,
  /create\s+(code|script)\s+that/i,
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
  
  // Verificar si el usuario es repostero - si lo es, no aplicar restricciones
  let role = null;
  let userId = null;
  const authHeader = req.headers['authorization'];
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      role = decoded.role || null;
      userId = decoded.id || null;
    } catch (error) {
      // Token inválido, continuar como cliente (aplicar restricciones)
      role = null;
      userId = null;
    }
  }
  
  // Usar IP como identificador para usuarios no autenticados
  const { getClientIP } = require('./clientIp');
  const identifier = userId || getClientIP(req);
  
  // 1. Validar que el mensaje existe
  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      error: 'Invalid message',
      message: 'El mensaje es requerido y debe ser texto'
    });
  }
  
  // 2. Validar longitud del mensaje
  const lengthValidation = validateMessageLength(message);
  if (!lengthValidation.valid) {
    logSecurityEvent('CHAT_MESSAGE_LENGTH_EXCEEDED', {
      ip: req.ip,
      userId,
      reason: lengthValidation.reason,
      messageLength: message.length
    });
    return res.status(400).json({
      error: lengthValidation.reason,
      message: lengthValidation.message
    });
  }
  
  // 3. Verificar cooldown entre mensajes
  const cooldownCheck = checkCooldown(identifier);
  if (!cooldownCheck.valid) {
    logSecurityEvent('CHAT_COOLDOWN_ACTIVE', {
      ip: req.ip,
      userId
    });
    return res.status(429).json({
      error: cooldownCheck.reason,
      message: cooldownCheck.message
    });
  }
  
  // 4. Verificar mensajes repetidos
  const repeatCheck = checkRepeatMessages(identifier, message);
  if (!repeatCheck.valid) {
    logSecurityEvent('CHAT_REPEAT_MESSAGE', {
      ip: req.ip,
      userId
    });
    return res.status(400).json({
      error: repeatCheck.reason,
      message: repeatCheck.message
    });
  }
  
  // 5. Detectar patrones de ataque específicos del chat
  const attackPattern = detectChatAttackPatterns(message);
  if (attackPattern) {
    logSecurityEvent('CHAT_ATTACK_PATTERN_DETECTED', {
      ip: req.ip,
      userId,
      attackType: attackPattern.type,
      pattern: attackPattern.pattern,
      userAgent: req.headers['user-agent']
    });
    
    return res.status(403).json({
      error: 'Message blocked',
      message: 'Tu mensaje contiene patrones sospechosos y fue bloqueado por seguridad'
    });
  }
  
  // 6. Sanitización básica (remover caracteres de control peligrosos)
  const sanitizedMessage = message
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // caracteres de control
    .trim();
  
  // Reemplazar el mensaje original con el sanitizado
  req.body.message = sanitizedMessage;
  
  next();
};

module.exports = {
  clientChatGuard,
  validateMessageLength,
  detectChatAttackPatterns,
  CLIENT_CHAT_CONFIG
};
