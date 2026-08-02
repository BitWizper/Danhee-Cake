/**
 * Middleware global de manejo de errores.
 * Captura cualquier error lanzado con next(err) en los controladores.
 */
const errorHandler = (err, req, res, next) => {
  // Log detallado en desarrollo (sin exponer al cliente)
  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.stack);
  } else {
    console.error(`[ERROR] ${req.method} ${req.path}: ${err.message}`);
  }

  // Errores de validación (express-validator)
  if (err.type === 'validation') {
    // En producción devolver un mensaje genérico para no filtrar detalles de validación
    if (process.env.NODE_ENV === 'development') {
      return res.status(422).json({
        success: false,
        message: 'Datos inválidos',
        errors: err.errors,
      });
    }

    return res.status(422).json({
      success: false,
      error_code: 'INVALID_PARAMETERS',
      message: 'Solicitud inválida',
    });
  }

  // Errores de CORS explícitos
  if (err && typeof err.message === 'string' && (err.message.includes('CORS no permitido') || err.message.includes('Not allowed by CORS'))) {
    return res.status(403).json({
      success: false,
      error_code: 'FORBIDDEN',
      message: 'Origen no permitido'
    });
  }

  // Errores de sintaxis JSON (body-parser) - devolver mensajes genéricos en prod
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({
      success: false,
      error_code: 'INVALID_JSON',
      message: process.env.NODE_ENV === 'development' ? 'JSON inválido. Verifica el formato de tu solicitud.' : 'Solicitud inválida',
    });
  }

  // Errores MySQL conocidos
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'El correo electrónico ya está registrado.',
    });
  }

  if (err.code === 'ER_NO_SUCH_TABLE') {
    return res.status(500).json({
      success: false,
      message: 'Error de base de datos. Contacta al soporte.',
    });
  }

  // Error JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token inválido.',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'La sesión ha expirado. Inicia sesión nuevamente.',
    });
  }

  // Error genérico - nunca exponer stack traces en producción
  const statusCode = err.statusCode || err.status || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  const payload = {
    success: false,
    error_code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED',
    message: isDevelopment ? (err.message || 'Error interno del servidor.') : (statusCode >= 500 ? 'Error interno del servidor.' : 'Solicitud inválida'),
  };

  // Solo en desarrollo exponer información adicional
  if (isDevelopment) {
    payload.stack = err.stack;
    if (err.details) payload.details = err.details;
  }

  res.status(statusCode).json(payload);
};

module.exports = errorHandler;
