/**
 * Middleware para bloquear métodos HTTP peligrosos
 * Previene TRACE, TRACK, PUT, DELETE, PATCH y otros métodos que no son necesarios
 */

const ALLOWED_METHODS = ['GET', 'POST', 'HEAD', 'OPTIONS'];
const DANGEROUS_METHODS = ['TRACE', 'TRACK', 'PUT', 'DELETE', 'PATCH', 'CONNECT', 'PROPFIND', 'COPY', 'MOVE', 'PROPPATCH', 'MKCOL', 'LOCK', 'UNLOCK'];

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

  // Si no es GET, POST, HEAD u OPTIONS, también bloquear (método desconocido)
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
