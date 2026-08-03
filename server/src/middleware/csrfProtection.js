// middleware/csrfProtection.js
// Middleware de protección CSRF usando tokens

const crypto = require('crypto');

// Almacenamiento de tokens CSRF en memoria (en producción usar Redis o base de datos)
const csrfTokens = new Set();

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
  console.log('[CSRF] ========== INICIO CSRF PROTECTION ==========');
  console.log('[CSRF] Method:', req.method);
  console.log('[CSRF] Path:', req.path);
  console.log('[CSRF] BaseUrl:', req.baseUrl);
  
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    console.log('[CSRF] ⏩ Skip (método seguro)');
    return next();
  }

  const routePath = getEffectiveRoutePath(req);
  const isAuthMutationRoute = [
    '/auth/login',
    '/auth/register',
    '/api/auth/login',
    '/api/auth/register'
  ].includes(routePath);
  console.log('[CSRF] Effective route path:', routePath);
  console.log('[CSRF] Es ruta auth mutation?', isAuthMutationRoute);

  if (!isAuthMutationRoute && process.env.NODE_ENV !== 'production') {
    console.log('[CSRF] ⏩ CSRF desactivado en desarrollo para ruta no-auth');
    return next();
  }

  const csrfTokenFromHeader = req.headers['x-csrf-token'];
  const csrfTokenFromBody = req.body?.csrf_token;
  const csrfTokenFromCookie = req.cookies?.csrf_token;
  const providedToken = csrfTokenFromHeader || csrfTokenFromBody;

  console.log('[CSRF] Origin header:', req.headers.origin);
  console.log('[CSRF] Host header:', req.headers.host);
  console.log('[CSRF] Referer header:', req.headers.referer);
  console.log('[CSRF] Cookies header:', req.headers.cookie);
  console.log('[CSRF] Token del header:', csrfTokenFromHeader ? csrfTokenFromHeader.substring(0, 8) + '...' : 'ausente');
  console.log('[CSRF] Token del body:', csrfTokenFromBody ? csrfTokenFromBody.substring(0, 8) + '...' : 'ausente');
  console.log('[CSRF] Token de cookie:', csrfTokenFromCookie ? csrfTokenFromCookie.substring(0, 8) + '...' : 'ausente');

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

  if (!csrfTokens.has(csrfTokenFromCookie)) {
    console.log('[CSRF] ❌ Token no encontrado en store del servidor');
    console.log('[CSRF] Total tokens en store:', csrfTokens.size);
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_INVALID',
      cause: 'token_not_in_store',
      message: 'Token CSRF inválido'
    });
  }

  if (csrfTokenFromCookie !== providedToken) {
    console.log('[CSRF] ❌ Mismatch entre cookie y token enviado');
    console.log('[CSRF] Cookie token:', csrfTokenFromCookie.substring(0, 8) + '...');
    console.log('[CSRF] Provided token:', providedToken.substring(0, 8) + '...');
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_INVALID',
      cause: 'cookie_token_mismatch',
      message: 'Token CSRF inválido'
    });
  }

  console.log('[CSRF] ✅ Token validado correctamente');
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
    sameSite: isProduction ? 'none' : 'lax', // cross-site POST requiere SameSite=None en producción
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
  csrfTokens.add(token);

  console.log('[CSRF] Generating token:', token.substring(0, 8) + '...');
  console.log('[CSRF] Origin:', req.headers.origin);
  console.log('[CSRF] Referer:', req.headers.referer);
  
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalhost = isLocalhostRequest(req);
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: isProduction && !isLocalhost,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.setHeader('X-CSRF-Token', token);
  console.log('[CSRF] Token sent in header and cookie');
  next();
};

const addCsrfToken = (token) => {
  csrfTokens.add(token);
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