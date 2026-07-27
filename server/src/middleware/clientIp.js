// middleware/clientIp.js
// Utilidades para extraer la IP real del cliente, incluso detrás de proxies o túneles.

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^::1$/,
  /^::ffff:127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^fc00:/i,
  /^fe80:/i,
  /^169\.254\./,
];

const normalizeIp = (ip) => {
  if (!ip || typeof ip !== 'string') return '';
  let cleaned = ip.trim();

  // Remover corchetes en direcciones IPv6
  cleaned = cleaned.replace(/^\[|\]$/g, '');

  // Remover puerto si está presente
  cleaned = cleaned.replace(/:\d+$/, '');

  // Normalizar IPv4 dentro de IPv6
  if (cleaned.toLowerCase().startsWith('::ffff:')) {
    cleaned = cleaned.substring(7);
  }

  return cleaned;
};

const parseForwardedHeader = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap(v => parseForwardedHeader(v));
  }

  const candidates = [];
  const raw = String(value);

  if (raw.includes('for=')) {
    const regex = /for=(?:"?)([^;,"]+)(?:"?)/gi;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      candidates.push(normalizeIp(match[1]));
    }
    return candidates.filter(Boolean);
  }

  return raw.split(',').map((chunk) => normalizeIp(chunk)).filter(Boolean);
};

const isPrivateIp = (ip) => {
  if (!ip) return false;
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
};

const selectClientIp = (candidates) => {
  const filtered = candidates.map(normalizeIp).filter(Boolean);
  if (filtered.length === 0) return '';

  // Preferir la primera IP pública del listado
  for (const ip of filtered) {
    if (!isPrivateIp(ip)) {
      return ip;
    }
  }

  // Si no hay IP pública, regresar la primera válida
  return filtered[0];
};

const getClientIP = (req) => {
  const headers = req.headers || {};
  const forwarded = headers['x-forwarded-for'] || headers['forwarded'] || headers['x-forwarded'] || headers['forwarded-for'];
  const realIp = headers['x-real-ip'] || headers['x-client-ip'] || headers['true-client-ip'] || headers['cf-connecting-ip'] || headers['fastly-client-ip'] || headers['x-cluster-client-ip'] || headers['x-forwarded-client-ip'];
  const candidates = parseForwardedHeader(forwarded);

  if (Array.isArray(req.ips) && req.ips.length) {
    candidates.unshift(...req.ips.map(normalizeIp).filter(Boolean));
  }

  if (realIp) {
    candidates.unshift(normalizeIp(realIp));
  }

  const ip = selectClientIp(candidates);
  if (ip) return ip;

  return normalizeIp(req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown') || 'unknown';
};

module.exports = {
  getClientIP,
  normalizeIp,
  isPrivateIp,
};
