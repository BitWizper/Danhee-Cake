const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación JWT.
 * Verifica el token Bearer en el header Authorization.
 */
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Acceso denegado. Token requerido.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    next(err); // Pasa a errorHandler (JWT errors)
  }
};

/**
 * Middleware de autorización por rol.
 * Uso: authorize('repostero') o authorize('cliente', 'repostero')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción.',
    });
  }
  next();
};

module.exports = { authMiddleware, authorize };
