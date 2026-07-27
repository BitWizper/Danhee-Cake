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
    return res.status(422).json({
      success: false,
      message: 'Datos inválidos',
      errors: err.errors,
    });
  }

  // Errores de sintaxis JSON (body-parser)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'JSON inválido. Verifica el formato de tu solicitud.',
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

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Error interno del servidor.',
    // Solo en desarrollo exponer información adicional
    ...(isDevelopment && {
      stack: err.stack,
      details: err.details
    }),
  });
};

module.exports = errorHandler;
