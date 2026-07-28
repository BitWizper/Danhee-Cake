const MAX_TOTAL_PARAMETERS = 60;
const MAX_PARAMETER_LENGTH = 2000;
const MAX_NESTING_DEPTH = 3;
const SUSPICIOUS_PARAMETER_NAMES = [
  '__proto__',
  'constructor',
  'prototype',
  'eval',
  'exec',
  'cmd',
  'drop',
  'script',
  'alert',
  'redirect',
  'next',
  'url',
  'return_to'
];

const countParams = (value, depth = 0) => {
  if (value === null || value === undefined) return 0;
  if (typeof value !== 'object') return 1;
  if (Array.isArray(value)) return value.length;
  if (depth > MAX_NESTING_DEPTH) return Infinity;

  return Object.keys(value).reduce((total, key) => total + countParams(value[key], depth + 1), 0);
};

const hasSuspiciousParameterNames = (value, prefix = '') => {
  if (!value || typeof value !== 'object') return false;

  for (const [key, nestedValue] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (SUSPICIOUS_PARAMETER_NAMES.includes(key.toLowerCase())) {
      return true;
    }

    if (typeof nestedValue === 'object' && nestedValue !== null && hasSuspiciousParameterNames(nestedValue, path)) {
      return true;
    }
  }

  return false;
};

const hasSuspiciousValues = (value) => {
  if (typeof value === 'string') {
    return value.length > MAX_PARAMETER_LENGTH || /<script|javascript:|union\s+select|drop\s+table|or\s+1\s*=\s*1/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasSuspiciousValues(item));
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => hasSuspiciousValues(item));
  }

  return false;
};

const apiFuzzingGuard = (req, res, next) => {
  const method = (req.method || '').toUpperCase();
  if (method === 'OPTIONS') {
    return next();
  }

  const sources = [req.query, req.params, req.body];
  const totalParameterCount = sources.reduce((total, source) => {
    if (!source || typeof source !== 'object') return total;
    return total + Object.keys(source).length;
  }, 0);

  if (totalParameterCount >= MAX_TOTAL_PARAMETERS) {
    console.warn(`[SECURITY] Fuzzing de parámetros bloqueado en ${req.originalUrl}`);
    return res.status(400).json({
      success: false,
      error_code: 'INVALID_REQUEST',
      message: 'Solicitud inválida.'
    });
  }

  const paramSources = [req.query, req.params, req.body];
  if (paramSources.some((source) => hasSuspiciousParameterNames(source))) {
    return res.status(400).json({
      success: false,
      error_code: 'INVALID_REQUEST',
      message: 'Solicitud inválida.'
    });
  }

  if (paramSources.some((source) => hasSuspiciousValues(source))) {
    return res.status(400).json({
      success: false,
      error_code: 'INVALID_REQUEST',
      message: 'Solicitud inválida.'
    });
  }

    if (paramSources.some((source) => countParams(source) > MAX_TOTAL_PARAMETERS)) {
    return res.status(400).json({
      success: false,
      error_code: 'INVALID_REQUEST',
      message: 'Solicitud inválida.'
    });
  }

  next();
};

module.exports = {
  apiFuzzingGuard
};
