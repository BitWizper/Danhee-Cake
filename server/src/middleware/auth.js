// middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../config/db');

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
  console.log('[Auth Middleware] ========== INICIO AUTH MIDDLEWARE ==========');
  console.log('[Auth Middleware] Path:', req.path);
  console.log('[Auth Middleware] Method:', req.method);
  
  try {
    const authHeader = req.headers['authorization'];
    const cookieToken = req.cookies?.access_token;
    
    console.log('[Auth Middleware] Auth header presente?', !!authHeader);
    console.log('[Auth Middleware] Cookie access_token presente?', !!cookieToken);
    
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
      console.log('[Auth Middleware] Token obtenido de Authorization header');
    } else if (cookieToken) {
      token = cookieToken;
      console.log('[Auth Middleware] Token obtenido de cookie');
    }

    if (!token) {
      console.log('[Auth Middleware] ❌ No se encontró token');
      return res.status(401).json({
        success: false,
        message: 'Acceso denegado. Token requerido.',
        error: 'NO_TOKEN'
      });
    }

    console.log('[Auth Middleware] Verificando token JWT...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };

    console.log(`[Auth Middleware] ✅ Usuario autenticado: ${req.user.email} (ID: ${req.user.id}, Rol: ${req.user.role})`);
    console.log('[Auth Middleware] Token expira en:', new Date(decoded.exp * 1000).toISOString());
    next();
  } catch (err) {
    console.error('[Auth Middleware] ❌ Error en autenticación:', err.name);
    
    if (err.name === 'TokenExpiredError') {
      console.log('[Auth Middleware] ❌ Token expirado');
      return res.status(401).json({
        success: false,
        message: 'Token expirado. Por favor, inicia sesión nuevamente.',
        error: 'TOKEN_EXPIRED'
      });
    }

    if (err.name === 'JsonWebTokenError') {
      console.log('[Auth Middleware] ❌ Token inválido:', err.message);
      return res.status(401).json({
        success: false,
        message: 'Token inválido. Por favor, inicia sesión nuevamente.',
        error: 'INVALID_TOKEN'
      });
    }

    if (err.name === 'NotBeforeError') {
      console.log('[Auth Middleware] ❌ Token no válido aún');
      return res.status(401).json({
        success: false,
        message: 'Token no válido aún.',
        error: 'TOKEN_NOT_ACTIVE'
      });
    }

    console.error('[Auth Middleware] Error inesperado:', err);
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
const authorize = (...roles) => async (req, res, next) => {
  // Verificar que el usuario existe (el authMiddleware ya debería haberlo adjuntado)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'No autenticado. Por favor, inicia sesión.'
    });
  }

  // Aplanar roles si se pasa un array (fix para bug de doble array)
  const allowedRoles = roles.flat();

  try {
    // Verificar el rol del usuario en la base de datos (no confiar solo en JWT)
    const [users] = await db.execute(
      'SELECT role FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const dbRole = users[0].role;
    
    // Actualizar req.user.role con el rol de la base de datos
    req.user.role = dbRole;

    // Verificar si el rol del usuario está en la lista de roles permitidos
    if (!allowedRoles.includes(dbRole)) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere uno de los siguientes roles: ${allowedRoles.join(', ')}`,
        user_role: dbRole,
        required_roles: allowedRoles
      });
    }

    console.log(`[Auth] ✅ Autorización concedida para rol: ${dbRole} (verificado en BD)`);
    next();
  } catch (error) {
    console.error('[Auth] Error verificando rol en base de datos:', error);
    // En caso de error de BD, fallback al rol del JWT (con advertencia)
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado'
      });
    }
    console.warn('[Auth] ⚠️ Usando rol del JWT como fallback (BD no disponible)');
    next();
  }
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