// middleware/csrfProtection.js
// Middleware de protección CSRF usando tokens

const crypto = require('crypto');

// Almacenamiento de tokens CSRF en memoria (en producción usar Redis o base de datos)
const csrfTokens = new Map();

// Generar token CSRF
const generateCSRFToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Middleware para generar y validar token CSRF
const csrfProtection = (req, res, next) => {
  // Solo aplicar a métodos que modifican estado
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Obtener token del header o del body
  const csrfTokenFromHeader = req.headers['x-csrf-token'];
  const csrfTokenFromBody = req.body?.csrf_token;
  const csrfTokenFromCookie = req.cookies?.csrf_token;

  const providedToken = csrfTokenFromHeader || csrfTokenFromBody || csrfTokenFromCookie;

  if (!providedToken) {
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_MISSING',
      message: 'Token CSRF requerido para esta operación'
    });
  }

  // Verificar token (en producción verificar contra token almacenado por sesión)
  // Por ahora, usamos una validación simple basada en cookie
  if (csrfTokenFromCookie && providedToken !== csrfTokenFromCookie) {
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_INVALID',
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
  res.cookie('csrf_token', token, {
    httpOnly: false, // No httpOnly para que JavaScript pueda leerlo
    secure: isProduction,
    sameSite: 'strict',
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
  
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.setHeader('X-CSRF-Token', token);
  next();
};

module.exports = {
  csrfProtection,
  generateCSRFTokenMiddleware,
  csrfTokenGenerator,
  generateCSRFToken
};
