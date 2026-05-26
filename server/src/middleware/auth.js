// middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación JWT.
 * Verifica el token Bearer en el header Authorization.
 * 
 * Uso: 
 *   router.post('/ruta-protegida', authMiddleware, controlador);
 * 
 * El usuario decodificado se adjunta en req.user con la estructura:
 *   req.user = { id, email, role, iat, exp }
 */
const authMiddleware = (req, res, next) => {
  try {
    // Obtener el header de autorización
    const authHeader = req.headers['authorization'];

    // Verificar que existe y tiene formato Bearer
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Acceso denegado. Token requerido.',
        error: 'NO_TOKEN'
      });
    }

    // Extraer el token (eliminar 'Bearer ' del inicio)
    const token = authHeader.split(' ')[1];

    // Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Adjuntar el usuario decodificado a la request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };

    console.log(`[Auth] ✅ Usuario autenticado: ${req.user.email} (ID: ${req.user.id}, Rol: ${req.user.role})`);
    next();
  } catch (err) {
    // Manejar errores específicos de JWT
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado. Por favor, inicia sesión nuevamente.',
        error: 'TOKEN_EXPIRED'
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido. Por favor, inicia sesión nuevamente.',
        error: 'INVALID_TOKEN'
      });
    }

    // Otros errores
    console.error('[Auth] Error en autenticación:', err);
    next(err);
  }
};

/**
 * Middleware de autorización por rol.
 * Verifica que el usuario autenticado tenga uno de los roles permitidos.
 * 
 * Uso:
 *   router.post('/ruta-repostero', authMiddleware, authorize('repostero'), controlador);
 *   router.post('/ruta-cliente', authMiddleware, authorize('cliente', 'admin'), controlador);
 * 
 * @param {...string} roles - Lista de roles permitidos
 * @returns {Function} Middleware de autorización
 */
const authorize = (...roles) => (req, res, next) => {
  // Verificar que el usuario existe (el authMiddleware ya debería haberlo adjuntado)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'No autenticado. Por favor, inicia sesión.'
    });
  }

  // Verificar si el rol del usuario está en la lista de roles permitidos
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Acceso denegado. Se requiere uno de los siguientes roles: ${roles.join(', ')}`,
      user_role: req.user.role,
      required_roles: roles
    });
  }

  console.log(`[Auth] ✅ Autorización concedida para rol: ${req.user.role}`);
  next();
};

/**
 * Middleware opcional para verificar token sin bloquear la petición.
 * Útil para endpoints que pueden funcionar con o sin autenticación.
 * Si hay token válido, adjunta el usuario; si no, continúa con req.user = null.
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role
      };
      console.log(`[Auth] ✅ Usuario opcional autenticado: ${req.user.email}`);
    } else {
      req.user = null;
    }
    next();
  } catch (err) {
    // Si hay error con el token, simplemente no adjuntamos usuario
    req.user = null;
    next();
  }
};

module.exports = { authMiddleware, authorize, optionalAuth };