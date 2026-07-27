/**
 * Frontend security for the chatbot.
 * Mirrors server limits in server/src/middleware/clientChatGuard.js and rateLimiter.js
 */

import {
  checkAndRecordRateLimit,
  getRateLimitStatus,
  syncServerRateLimit,
  formatBlockTime,
} from './rateLimiter.js';

import {
  validateJSONStructure,
} from './domSecurity.js';

export const CHAT_SECURITY_CONFIG = {
  maxMessageLength: 2000,
  maxWords: 300,
  minMessageLength: 1,
  cooldownPeriod: 2000,
  maxIdenticalConsecutive: 2,
  rateLimit: {
    storageKey: 'chat_rl',
    maxMessages: 20,
    windowMs: 60 * 1000,
    blockDuration: 30 * 1000,
  },
  blockedPatterns: [
    // XSS
    /<script[^>]*>.*?<\/script>/gi,
    /<style[^>]*>.*?<\/style>/gi,
    /javascript:/gi,
    /data:text\/html/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
    /eval\s*\(/gi,
    /exec\s*\(/gi,
    /<iframe/gi,
    /<embed/gi,
    /<object/gi,
    /<svg[^>]*on\w+/gi,
    /<(?:script|img|svg|iframe|object|embed|link|meta)[^>]*(?:src|href|on\w+)\s*=/gi,
    /(?:alert|confirm|prompt)\s*\(/gi,
    /document\.(?:write|createElement|cookie)/gi,
    /window\.(?:open|location)/gi,
    /(?:&lt;|&gt;|&#x3c;|&#x3e;|%3c|%3e)/gi,
    /document\./gi,
    /window\./gi,
    /localStorage\./gi,
    /sessionStorage\./gi,
    /\bdocument\.cookie\b/gi,

    // SQL Injection
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b)/gi,
    /(;|--|\/\*|\*\/|@@)/g,
    /('(\s)*(=|OR|AND|XOR))/gi,
    /("(\s)*(=|OR|AND|XOR))/gi,
    /(1\s*=\s*1|true\s*=\s*true|'1'\s*=\s*'1')/gi,
    /\bwaitfor\s+delay\b/gi,
    /\bsleep\b\s*\(/gi,
    /\bbenchmark\b\s*\(/gi,
    /\binformation_schema\b/gi,

    // NoSQL Injection
    /\$where\b/gi,
    /\$(gt|lt|ne|in|nin|regex|exists|type|mod|text|where)\b/gi,
    /\{\s*"\$[a-z]+"/gi,

    // Command Injection
    /;\s*(rm|ls|cat|wget|curl|nc|netcat|bash|sh|python|perl|ruby|php|powershell|cmd)\b/gi,
    /\|\s*(rm|ls|cat|wget|curl|nc)\b/gi,
    /`[^`]+`/g,
    /\$\([^)]+\)/g,
    /\bchmod\b|\bchown\b|\bmkdir\b|\brm\s+-/gi,

    // LFI / Path Traversal
    /\.\.\//g,
    /%2e%2e/gi,
    /\/etc\/passwd/gi,
    /\/proc\/self/gi,
    /file:\/\//gi,

    // Template / SSTI injection
    /\$\{.*?\}/g,
    /\{\{.*?\}\}/g,
    /<%.*?%>/g,
    /#\{.*?\}/g,

    // Prototype pollution
    /__proto__/gi,
    /constructor\s*\[/gi,
    /prototype\s*\./gi,

    // Prompt Injection / LLM Jailbreak
    /ignore\s+(previous|prior|all)\s+(instructions?|prompts?|rules?|context)/gi,
    /forget\s+(your|all|previous)\s+(instructions?|rules?|training|guidelines?)/gi,
    /act\s+as\s+(a\s+)?(different|new|uncensored|unrestricted|evil|jailbroken|hacker)/gi,
    /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(human|unrestricted|evil|different)/gi,
    /you\s+are\s+now\s+(a\s+)?(?:dan|jailbroken|uncensored|evil|hacker)/gi,
    /\[INST\]|\[\/INST\]|<\|system\|>|<system>|<\|im_start\|>/gi,
    /system\s*prompt/gi,
    /override\s+(your\s+)?(instructions?|rules?|training|safety)/gi,
    /disregard\s+(your\s+)?(previous|all)\s+(instructions?|rules?)/gi,
    /new\s+instructions?:/gi,
    /do\s+anything\s+now/gi,
    /jailbreak/gi,
    /bypass\s+(your\s+)?(safety|filter|restrictions?)/gi,
    /reveal\s+(your\s+)?(system\s+)?prompt/gi,
    /show\s+me\s+(your\s+)?(system\s+)?prompt/gi,
    /what\s+(are|were)\s+your\s+(original\s+)?instructions/gi,
    /\bDAN\s+mode\b/gi,
    /developer\s+mode/gi,
    /unrestricted\s+mode/gi,
  ],
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SSE_TYPES = new Set(['conversation_id', 'state', 'token', 'error']);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const HTML_TAG = /<[^>]*>/g;

export const isValidUUID = (id) => {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id);
};

export const isValidConversationId = (id) => {
  if (!id) return true;
  return isValidUUID(id);
};

export const isValidSSEEvent = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (!VALID_SSE_TYPES.has(data.type)) return false;
  
  // Validar estructura contra prototype pollution
  if (!validateJSONStructure(data)) {
    console.warn('[Security] SSE event failed structure validation');
    return false;
  }
  
  if (data.type === 'conversation_id' && typeof data.conversation_id !== 'string') return false;
  if (data.type === 'token' && typeof data.content !== 'string') return false;
  if (data.type === 'error' && typeof data.content !== 'string') return false;
  if (data.type === 'state') {
    if (typeof data.status !== 'string' || typeof data.message !== 'string') return false;
  }
  return true;
};

export const sanitizeMessage = (message) => {
  if (!message || typeof message !== 'string') return '';
  return message.replace(CONTROL_CHARS, '').trim();
};

/** Strip HTML tags from displayed text (defense in depth for bot/history content) */
export const sanitizeDisplayText = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text.replace(CONTROL_CHARS, '').replace(HTML_TAG, '');
};

export const validateMessage = (message) => {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'El mensaje es requerido' };
  }

  const trimmed = message.trim();
  const { minMessageLength, maxMessageLength, maxWords, blockedPatterns } = CHAT_SECURITY_CONFIG;

  if (trimmed.length < minMessageLength) {
    return { valid: false, error: 'El mensaje debe tener al menos 1 carácter' };
  }

  if (trimmed.length > maxMessageLength) {
    return { valid: false, error: `El mensaje no puede exceder ${maxMessageLength} caracteres` };
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > maxWords) {
    return { valid: false, error: `El mensaje no puede exceder ${maxWords} palabras` };
  }

  if (CONTROL_CHARS.test(trimmed)) {
    return { valid: false, error: 'El mensaje contiene caracteres inválidos' };
  }

  // Normalizar Unicode para detectar caracteres disfrazados
  const normalized = trimmed.normalize('NFKC');
  
  for (const pattern of blockedPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(normalized)) {
      return { valid: false, error: 'El mensaje contiene contenido no permitido por seguridad' };
    }
  }

  // Detectar intentos de encoded payloads
  if (hasEncodedPayload(normalized)) {
    return { valid: false, error: 'El mensaje contiene contenido codificado sospechoso' };
  }

  // Validar proporción de caracteres especiales
  if (hasExcessiveSpecialChars(normalized)) {
    return { valid: false, error: 'El mensaje contiene demasiados caracteres especiales' };
  }

  return { valid: true };
};

/**
 * Detecta payloads codificados comunes (hex, base64, etc)
 */
export const hasEncodedPayload = (text) => {
  if (!text || typeof text !== 'string') return false;
  
  // Detección de patrones hex codificados
  const hexPattern = /\\x[0-9a-f]{2}|%[0-9a-f]{2}/gi;
  if (hexPattern.test(text) && text.match(hexPattern).length > 5) return true;
  
  // Detección de Unicode escapes
  const unicodePattern = /\\u[0-9a-f]{4}|&#\d+;|&#x[0-9a-f]+;/gi;
  if (unicodePattern.test(text) && text.match(unicodePattern).length > 3) return true;
  
  // Detección de base64 que contiene scripts
  const base64Pattern = /^[A-Za-z0-9+/]{50,}={0,2}$/;
  if (base64Pattern.test(text)) {
    try {
      const decoded = atob(text);
      if (/script|exec|eval|onclick|<script|on\w+=/i.test(decoded)) {
        return true;
      }
    } catch {
      // No es base64 válido, ignorar
    }
  }
  
  return false;
};

/**
 * Detecta proporción anormal de caracteres especiales
 */
export const hasExcessiveSpecialChars = (text) => {
  if (!text || typeof text !== 'string') return false;
  
  const specialChars = text.match(/[^a-zA-Z0-9\s.,?!:;\-()\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00FC\u00E0\u00E8\u00EC\u00F2\u00F9]/g) || [];
  const specialRatio = specialChars.length / text.length;
  
  // Si más del 30% son caracteres especiales, es sospechoso
  return specialRatio > 0.3;
};

export const isSpamMessage = (newText, chat) => {
  const { maxIdenticalConsecutive } = CHAT_SECURITY_CONFIG;
  const userMessages = chat
    .filter((m) => m.sender === 'user')
    .slice(-maxIdenticalConsecutive);

  if (userMessages.length === 0) return false;

  const normalized = newText.toLowerCase().trim();
  const identicalCount = userMessages.filter(
    (m) => m.text.toLowerCase().trim() === normalized
  ).length;

  return identicalCount >= maxIdenticalConsecutive;
};

export const getChatRateLimitStatus = () =>
  getRateLimitStatus(CHAT_SECURITY_CONFIG.rateLimit);

export const checkAndRecordChatRateLimit = () =>
  checkAndRecordRateLimit(CHAT_SECURITY_CONFIG.rateLimit);

export const syncChatServerRateLimit = (retryAfterSec) =>
  syncServerRateLimit(CHAT_SECURITY_CONFIG.rateLimit, retryAfterSec);

/**
 * Valida entrada con filtrado sensible al contexto
 * @param {string} input - Input a validar
 * @param {string} context - Contexto de validación: 'chat', 'form', 'url'
 */
export const validateInputByContext = (input, context = 'chat') => {
  if (!input || typeof input !== 'string') return false;

  const trimmed = input.trim();

  switch (context) {
    case 'email':
      // RFC 5322 simplified
      return /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed);
    
    case 'url':
      try {
        const url = new URL(trimmed);
        // Solo permitir protocolos seguros
        return /^https?:$/.test(url.protocol);
      } catch {
        return false;
      }
    
    case 'uuid':
      return isValidUUID(trimmed);
    
    case 'chat':
    default:
      return validateMessage(trimmed).valid;
  }
};

/**
 * Detecta intentos de ataque XSS a nivel de DOM
 */
export const detectDOMXSS = (html) => {
  if (!html || typeof html !== 'string') return false;

  const suspiciousPatterns = [
    // Event handlers
    /on(?:load|error|click|mouse|key|focus|blur|change|submit)\s*=/gi,
    // Script tags
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    // Data URIs con javascript
    /data:text\/html|data:application\/javascript/gi,
    // SVG con event handlers
    /<svg[^>]*on\w+/gi,
    // iframe con javascript:
    /<iframe[^>]*src\s*=\s*['"]*javascript:/gi,
    // Meta refresh con javascript
    /<meta[^>]*http-equiv\s*=\s*['"]?refresh/gi,
  ];

  return suspiciousPatterns.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(html);
  });
};

/**
 * Detecta intentos de SQL Injection más avanzados
 */
export const detectAdvancedSQLi = (input) => {
  if (!input || typeof input !== 'string') return false;

  const advancedPatterns = [
    // Time-based blind SQLi
    /(\bwaitfor\b.*\bdelay\b|\bsleep\s*\(|\bbenchmark\s*\()/gi,
    // Boolean-based blind SQLi
    /\band\s+(?:\d+\s*=\s*\d+|'[^']*'\s*=\s*'[^']*'|\btrue\b|\bfalse\b)/gi,
    // Comment-based SQLi
    /--\s*$|--\s+|#\s|\/\*.*?\*\//gi,
    // Union-based SQLi
    /\bunion\s+(?:all\s+)?select\b/gi,
    // Stacked queries
    /;\s*(?:select|insert|update|delete|drop|create|alter)\b/gi,
    // Time functions
    /(?:now\(\)|current_timestamp|getdate\(\)|systimestamp)/gi,
  ];

  return advancedPatterns.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
};

/**
 * Detecta intentos de NoSQL Injection
 */
export const detectNoSQLi = (input) => {
  if (!input || typeof input !== 'string') return false;

  // Detectar operadores MongoDB/NoSQL
  const nosqlPatterns = [
    /\$where/gi,
    /\$ne\b|\$gt\b|\$lt\b|\$regex\b/gi,
    /\{.*"\$\w+".*:\s*\{/gi,
    /\.\.\./g, // Path traversal en NoSQL
  ];

  return nosqlPatterns.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
};

/**
 * Sanitización mejorada con decodificación de entidades HTML
 */
export const sanitizeMessageAdvanced = (message) => {
  if (!message || typeof message !== 'string') return '';

  let sanitized = message;

  // Decodificar entidades HTML múltiples veces para evitar double-encoding bypass
  for (let i = 0; i < 3; i++) {
    sanitized = decodeHTMLEntities(sanitized);
  }

  // Normalizar whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Remover caracteres de control
  sanitized = sanitized.replace(CONTROL_CHARS, '');

  // Quitar payloads obfuscados y scripts
  sanitized = sanitized.replace(/(?:&lt;|&gt;|&#x3c;|&#x3e;|%3c|%3e)/gi, '');
  sanitized = sanitized.replace(/(?:javascript:|data:text\/html|vbscript:)/gi, '');

  // Remover HTML tags
  sanitized = sanitized.replace(HTML_TAG, '');

  return sanitized.trim();
};

/**
 * Decodifica entidades HTML
 */
export const decodeHTMLEntities = (text) => {
  if (!text || typeof text !== 'string') return '';
  
  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
  };

  let result = text;
  Object.keys(map).forEach(entity => {
    result = result.split(entity).join(map[entity]);
  });

  return result;
};

export { formatBlockTime };
