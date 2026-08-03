// middleware/csrfProtection.js
// Middleware de protección CSRF usando tokens

const crypto = require('crypto');

// Almacenamiento de tokens CSRF en memoria con TTL
const csrfTokens = new Map();
const CSRF_TTL = 24 * 60 * 60 * 1000; // 24 horas

const cleanExpiredTokens = () => {
  const now = Date.now();
  for (const [token, expiry] of csrfTokens.entries()) {
    if (now > expiry) {
      csrfTokens.delete(token);
    }
  }
};

// Generar token CSRF
const generateCSRFToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const isLocalhostRequest = (req) => {
  const host = String(req.hostname || req.headers.host || '').toLowerCase();
  return host.includes('localhost') || host.includes('127.0.0.1') || host.includes('[::1]');
};

const getEffectiveRoutePath = (req) => {
  const baseUrl = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  const path = typeof req.path === 'string' ? req.path : '';
  return `${baseUrl}${path}`;
};

// Middleware para generar y validar token CSRF
const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const routePath = getEffectiveRoutePath(req);
  const isAuthMutationRoute = [
    '/auth/login',
    '/auth/register',
    '/api/auth/login',
    '/api/auth/register'
  ].includes(routePath);

  if (!isAuthMutationRoute && process.env.NODE_ENV !== 'production') {
    return next();
  }

  const csrfTokenFromHeader = req.headers['x-csrf-token'];
  const csrfTokenFromBody = req.body?.csrf_token;
  const csrfTokenFromCookie = req.cookies?.csrf_token;
  const providedToken = csrfTokenFromHeader || csrfTokenFromBody;

  if (!csrfTokenFromCookie || !providedToken) {
    const missingCause = !csrfTokenFromCookie && !providedToken
      ? 'cookie_and_token_missing'
      : !csrfTokenFromCookie
        ? 'cookie_missing'
        : 'token_missing';

    console.log('[CSRF] ❌ Token CSRF faltante:', missingCause);
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_MISSING',
      cause: missingCause,
      message: 'Token CSRF requerido para esta operación'
    });
  }

  const tokenExpiry = csrfTokens.get(csrfTokenFromCookie);
  if (!tokenExpiry || Date.now() > tokenExpiry) {
    if (tokenExpiry) csrfTokens.delete(csrfTokenFromCookie);
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_INVALID',
      cause: 'token_not_in_store_or_expired',
      message: 'Token CSRF inválido o expirado'
    });
  }

  if (csrfTokenFromCookie !== providedToken) {
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_INVALID',
      cause: 'cookie_token_mismatch',
      message: 'Token CSRF inválido'
    });
  }

  next();
};

// Middleware para generar token CSRF y enviarlo en cookie
const generateCSRFTokenMiddleware = (req, res, next) => {
  const token = generateCSRFToken();
  
  // Enviar token como cookie httpOnly
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalhost = isLocalhostRequest(req);
  res.cookie('csrf_token', token, {
    httpOnly: false, // No httpOnly para que JavaScript pueda leerlo
    secure: isProduction && !isLocalhost,
    sameSite: 'lax', // Protección frente a cross-site POST
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  });

  // También enviarlo en header para facilitar el acceso
  res.setHeader('X-CSRF-Token', token);

  next();
};

// Middleware opcional que solo genera token sin forzar validación
const csrfTokenGenerator = (req, res, next) => {
  const token = generateCSRFToken();
  cleanExpiredTokens();
  csrfTokens.set(token, Date.now() + CSRF_TTL);
  
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalhost = isLocalhostRequest(req);
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: isProduction && !isLocalhost,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.setHeader('X-CSRF-Token', token);
  next();
};

const addCsrfToken = (token) => {
  cleanExpiredTokens();
  csrfTokens.set(token, Date.now() + CSRF_TTL);
};

const clearCsrfTokens = () => {
  csrfTokens.clear();
};

module.exports = {
  csrfProtection,
  generateCSRFTokenMiddleware,
  csrfTokenGenerator,
  generateCSRFToken,
  addCsrfToken,
  clearCsrfTokens
};