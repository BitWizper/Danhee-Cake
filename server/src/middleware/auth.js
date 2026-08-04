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
const authMiddleware = async (req, res, next) => {
  console.log('[Auth Middleware] ========== INICIO AUTH MIDDLEWARE ==========');
  console.log('[Auth Middleware] Path:', req.path);
  console.log('[Auth Middleware] Method:', req.method);
  console.log('[Auth Middleware] Headers:', JSON.stringify(req.headers, null, 2));
  
  try {
    const authHeader = req.headers['authorization'];
    const cookieToken = req.cookies?.access_token;
    
    console.log('[Auth Middleware] Auth header presente?', !!authHeader);
    console.log('[Auth Middleware] Auth header value:', authHeader);
    console.log('[Auth Middleware] Cookie access_token presente?', !!cookieToken);
    console.log('[Auth Middleware] Cookie access_token value:', cookieToken ? `${cookieToken.substring(0, 50)}...` : 'N/A');
    
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

    console.log('[Auth Middleware] Token length:', token.length);
    console.log('[Auth Middleware] Token starts with:', token.substring(0, 20));
    console.log('[Auth Middleware] JWT_SECRET presente?', !!process.env.JWT_SECRET);
    console.log('[Auth Middleware] JWT_SECRET length:', process.env.JWT_SECRET?.length);

    console.log('[Auth Middleware] Verificando token JWT...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    console.log('[Auth Middleware] ✅ Token decodificado exitosamente');
    console.log('[Auth Middleware] Decoded payload:', decoded);

    // ── Verificación activa en BD ──────────────────────────────
    // El JWT puede ser válido pero el usuario puede haber sido eliminado
    // o desactivado desde otro dispositivo / sesión.
    console.log('[Auth Middleware] Verificando usuario en BD (ID:', decoded.id, ')...');
    const [rows] = await db.execute(
      'SELECT id, email, role, is_active FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (!rows || rows.length === 0) {
      console.log('[Auth Middleware] ❌ Usuario no encontrado en BD');
      return res.status(401).json({
        success: false,
        message: 'Tu cuenta ya no existe. Por favor, regístrate de nuevo.',
        error: 'USER_NOT_FOUND'
      });
    }

    const dbUser = rows[0];

    if (!dbUser.is_active) {
      console.log('[Auth Middleware] ❌ Usuario inactivo:', dbUser.email);
      return res.status(403).json({
        success: false,
        message: 'Tu cuenta está desactivada. Contacta al administrador.',
        error: 'USER_INACTIVE'
      });
    }

    // Siempre usar los datos frescos de la BD, no del JWT
    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role
    };

    console.log(`[Auth Middleware] ✅ Usuario autenticado y activo: ${req.user.email} (ID: ${req.user.id}, Rol: ${req.user.role})`);
    console.log('[Auth Middleware] Token expira en:', new Date(decoded.exp * 1000).toISOString());
    next();
  } catch (err) {
    console.error('[Auth Middleware] ❌ Error en autenticación:', err.name);
    console.error('[Auth Middleware] Error message:', err.message);
    console.error('[Auth Middleware] Error stack:', err.stack);
    console.error('[Auth Middleware] Token que falló (primeros 100 chars):', token ? token.substring(0, 100) : 'N/A');
    console.error('[Auth Middleware] JWT_SECRET usado (primeros 50 chars):', process.env.JWT_SECRET ? process.env.JWT_SECRET.substring(0, 50) : 'N/A');
    
    if (err.name === 'TokenExpiredError') {
      console.log('[Auth Middleware] ❌ Token expirado');
      console.log('[Auth Middleware] Token expired at:', new Date(err.expiredAt * 1000).toISOString());
      return res.status(401).json({
        success: false,
        message: 'Token expirado. Por favor, inicia sesión nuevamente.',
        error: 'TOKEN_EXPIRED'
      });
    }

    if (err.name === 'JsonWebTokenError') {
      console.log('[Auth Middleware] ❌ Token inválido:', err.message);
      console.log('[Auth Middleware] Posibles causas:');
      console.log('[Auth Middleware]   1. Token mal formado o corrupto');
      console.log('[Auth Middleware]   2. JWT_SECRET no coincide con el que firmó el token');
      console.log('[Auth Middleware]   3. Token fue modificado en tránsito');
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
    // En caso de error de BD, rechazar la solicitud en lugar de usar fallback a JWT
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al verificar permisos.'
    });
  }
};

/**
 * Middleware opcional para verificar token sin bloquear la petición.
 * Útil para endpoints que pueden funcionar con o sin autenticación.
 * Si hay token válido, adjunta el usuario; si no, continúa con req.user = null.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const cookieToken = req.cookies?.access_token;
    
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      
      const [rows] = await db.execute(
        'SELECT id, email, role, is_active FROM users WHERE id = ? LIMIT 1',
        [decoded.id]
      );

      if (rows && rows.length > 0 && rows[0].is_active) {
        req.user = {
          id: rows[0].id,
          email: rows[0].email,
          role: rows[0].role
        };
        console.log(`[Auth] ✅ Usuario opcional autenticado: ${req.user.email}`);
      } else {
        req.user = null;
      }
    } else {
      req.user = null;
    }
    next();
  } catch (err) {
    req.user = null;
    next();
  }
};

module.exports = { authMiddleware, authorize, optionalAuth };