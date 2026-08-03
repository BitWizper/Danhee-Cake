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

  // El token puede venir en header (usando req.get para insensibilidad a mayúsculas) o en body
  const csrfTokenFromHeader = req.get ? req.get('X-CSRF-Token') : (req.headers['x-csrf-token'] || req.headers['X-CSRF-Token']);
  const csrfTokenFromBody = req.body?.csrf_token;
  const providedToken = csrfTokenFromHeader || csrfTokenFromBody;

  // La cookie es opcional: puede no llegar si el frontend es cross-origin (Vercel + Cloudflare)
  const csrfTokenFromCookie = req.cookies?.csrf_token;

  if (!providedToken) {
    console.log('[CSRF] Token CSRF faltante en header y body');
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_MISSING',
      cause: 'token_missing',
      message: 'Token CSRF requerido para esta operacion'
    });
  }

  // Validar el token directamente contra el Map (no dependemos de la cookie)
  const tokenExpiry = csrfTokens.get(providedToken);
  if (!tokenExpiry || Date.now() > tokenExpiry) {
    if (tokenExpiry) csrfTokens.delete(providedToken);
    console.log('[CSRF] Token CSRF no en store o expirado. Token:', providedToken?.substring(0, 8));
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_INVALID',
      cause: 'token_not_in_store_or_expired',
      message: 'Token CSRF invalido o expirado'
    });
  }

  // Si ademas hay cookie Y el token de la cookie tampoco esta en el Map, ignorar la cookie
  // (puede ser una cookie vieja de una sesion anterior del servidor)
  // La validacion real ya se hizo con el Map lookup de providedToken arriba.

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