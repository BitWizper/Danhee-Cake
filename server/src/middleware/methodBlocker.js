/**
 * Middleware para bloquear métodos HTTP peligrosos
 * Previene TRACE, TRACK y otros métodos que no son necesarios
 * Permite PUT, DELETE, PATCH en rutas de API específicas
 */

const ALLOWED_METHODS = ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'];
const DANGEROUS_METHODS = ['TRACE', 'TRACK', 'CONNECT', 'PROPFIND', 'COPY', 'MOVE', 'PROPPATCH', 'MKCOL', 'LOCK', 'UNLOCK'];

// Rutas que requieren métodos PUT, DELETE, PATCH
const API_WRITE_PATHS = [
  '/api/bakers/cakes',
  '/api/bakers/appointments',
  '/api/bakers/profile',
  '/api/appointments',
  '/api/payments',
  '/api/auth'
];

const methodBlocker = (req, res, next) => {
  const method = req.method.toUpperCase();

  // Bloquear métodos peligrosos
  if (DANGEROUS_METHODS.includes(method)) {
    console.warn(`[SECURITY] Método HTTP peligroso bloqueado: ${method} en ruta ${req.path}`);
    return res.status(405).set('Allow', ALLOWED_METHODS.join(', ')).json({
      success: false,
      message: `Método HTTP ${method} no permitido`,
      error: 'Method Not Allowed'
    });
  }

  // Si no es un método permitido, bloquear
  if (!ALLOWED_METHODS.includes(method)) {
    console.warn(`[SECURITY] Método HTTP desconocido bloqueado: ${method} en ruta ${req.path}`);
    return res.status(405).set('Allow', ALLOWED_METHODS.join(', ')).json({
      success: false,
      message: `Método HTTP ${method} no permitido`,
      error: 'Method Not Allowed'
    });
  }

  // Permitir si es un método permitido
  next();
};

module.exports = methodBlocker;
