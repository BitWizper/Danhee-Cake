// middleware/clientChatGuard.js
// Middleware de seguridad específico para chat de clientes
// Filtra mensajes peligrosos sin falsos positivos, solo para clientes

const jwt = require('jsonwebtoken');
const { logSecurityEvent } = require('./auditLogger');

// Configuración
const CLIENT_CHAT_CONFIG = {
  maxMessageLength: 2000, // máximo 2000 caracteres
  maxWords: 300, // máximo 300 palabras
  blockSuspiciousPatterns: true
};

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
  const authHeader = req.headers['authorization'];
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      role = decoded.role || null;
      
      // Si es repostero, permitir sin restricciones
      if (role === 'repostero') {
        return next();
      }
    } catch (error) {
      // Token inválido, continuar como cliente (aplicar restricciones)
      role = null;
    }
  }
  
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
      reason: lengthValidation.reason,
      messageLength: message.length
    });
    return res.status(400).json({
      error: lengthValidation.reason,
      message: lengthValidation.message
    });
  }
  
  // 3. Detectar patrones de ataque específicos del chat
  const attackPattern = detectChatAttackPatterns(message);
  if (attackPattern) {
    logSecurityEvent('CHAT_ATTACK_PATTERN_DETECTED', {
      ip: req.ip,
      attackType: attackPattern.type,
      pattern: attackPattern.pattern,
      userAgent: req.headers['user-agent']
    });
    
    return res.status(403).json({
      error: 'Message blocked',
      message: 'Tu mensaje contiene patrones sospechosos y fue bloqueado por seguridad'
    });
  }
  
  // 4. Sanitización básica (remover caracteres de control peligrosos)
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
