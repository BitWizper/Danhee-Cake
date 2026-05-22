/**
 * Middleware global de manejo de errores.
 * Captura cualquier error lanzado con next(err) en los controladores.
 */
const errorHandler = (err, req, res, next) => {
  // Log detallado en desarrollo
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

  // Error genérico
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Error interno del servidor.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
