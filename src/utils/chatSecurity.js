/**
 * Frontend security for the chatbot.
 * Mirrors server limits in server/src/middleware/clientChatGuard.js and rateLimiter.js
 */

import {
  checkAndRecordRateLimit,
  getRateLimitStatus,
  syncServerRateLimit,
  formatBlockTime,
} from './rateLimiter';

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

  for (const pattern of blockedPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'El mensaje contiene contenido no permitido por seguridad' };
    }
  }

  return { valid: true };
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

export { formatBlockTime };
