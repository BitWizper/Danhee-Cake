const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';

// Validación de email (RFC 5322)
const isValidEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
};

// Validación de contraseña (mínimo 8 caracteres, alfanuméricos)
const isValidPassword = (password) => {
  if (!password || password.length < 8) {
    return false;
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
};

// Sanitización de input contra SQL Injection
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  // Eliminar caracteres SQL peligrosos
  return input
    .replace(/['";\\]/g, '') // Eliminar comillas, backslash
    .replace(/--/g, '')      // Eliminar comentarios SQL
    .replace(/\/\*/g, '')     // Eliminar inicio de comentario
    .replace(/\*\//g, '')     // Eliminar fin de comentario
    .replace(/@@/g, '')       // Eliminar variables SQL
    .trim()
    .substring(0, 100);       // Limitar longitud
};

const runWithTimeout = (promise, ms = 6000, timeoutMessage = 'Database operation timed out') => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), ms)
    )
  ]);
};

exports.register = async (req, res, next) => {
  console.log('[Register Backend] ========== INICIO REGISTER ==========');
  console.log('[Register Backend] IP:', req.ip || req.connection?.remoteAddress);
  console.log('[Register Backend] Body recibido:', { 
    name: req.body.name, 
    email: req.body.email, 
    role: req.body.role,
    hasPassword: !!req.body.password
  });
  
  const { name, email, password, role, address, business_name, location, specialty, bio } = req.body;

  try {
    console.log('[Register Backend] Validando campos requeridos...');
    if (!name || !email || !password) {
      console.log('[Register Backend] ❌ Campos obligatorios faltantes');
      return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
    }

    console.log('[Register Backend] Validando formato de email...');
    if (!isValidEmail(email)) {
      console.log('[Register Backend] ❌ Email inválido:', email);
      return res.status(400).json({ success: false, message: 'Formato de correo electrónico inválido.' });
    }

    console.log('[Register Backend] Validando complejidad de contraseña...');
    if (!isValidPassword(password)) {
      console.log('[Register Backend] ❌ Contraseña no cumple requisitos');
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres e incluir letras y números.' });
    }

    console.log('[Register Backend] Validando role...');
    const allowedRoles = ['cliente', 'repostero'];
    const userRole = role || 'cliente';
    if (!allowedRoles.includes(userRole)) {
      console.log('[Register Backend] ❌ Role inválido:', userRole);
      return res.status(400).json({ 
        success: false, 
        message: 'Rol no válido. Solo se permiten: cliente, repostero' 
      });
    }

    console.log('[Register Backend] Sanitizando inputs...');
    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedAddress = address ? sanitizeInput(address) : null;
    const sanitizedBusinessName = business_name ? sanitizeInput(business_name) : null;
    const sanitizedLocation = location ? sanitizeInput(location) : null;
    const sanitizedSpecialty = specialty ? sanitizeInput(specialty) : null;
    const sanitizedBio = bio ? sanitizeInput(bio) : null;

    console.log('[Register Backend] Validando nombre...');
    if (!name || name.trim().length === 0) {
      console.log('[Register Backend] ❌ Nombre vacío');
      return res.status(400).json({ success: false, message: 'El nombre es requerido.' });
    }

    if (name.trim().length < 2 || name.trim().length > 150) {
      console.log('[Register Backend] ❌ Nombre longitud inválida:', name.trim().length);
      return res.status(400).json({ success: false, message: 'El nombre debe tener entre 2 y 150 caracteres.' });
    }

    const validNamePattern = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s'\-.,]+$/;
    if (!validNamePattern.test(name.trim())) {
      console.log('[Register Backend] ❌ Nombre contiene caracteres inválidos');
      return res.status(400).json({ success: false, message: 'El nombre contiene caracteres inválidos.' });
    }

    if (!sanitizedName) {
      console.log('[Register Backend] ❌ Nombre vacío después de sanitización');
      return res.status(400).json({ success: false, message: 'El nombre no puede estar vacío.' });
    }

    console.log('[Register Backend] Verificando si usuario ya existe en la base de datos...');
    const [existingUser] = await runWithTimeout(
      db.execute('SELECT id FROM users WHERE email = ?', [sanitizedEmail]),
      6000,
      'Timeout consultando disponibilidad de usuario en la base de datos'
    );

    if (existingUser.length > 0) {
      console.log('[Register Backend] ❌ Usuario ya existe:', sanitizedEmail);
      return res.status(400).json({
        success: false,
        message: 'No se pudo completar el registro. Verifica tus datos e intenta de nuevo.'
      });
    }

    console.log('[Register Backend] ✅ Usuario no existe, procediendo a crear:', { name: sanitizedName, email: sanitizedEmail, role: userRole });

    console.log('[Register Backend] Hasheando contraseña...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log('[Register Backend] ✅ Contraseña hasheada');

    console.log('[Register Backend] Insertando usuario en BD...');
    const [userResult] = await runWithTimeout(
      db.execute(
        'INSERT INTO users (name, email, password_hash, role, address) VALUES (?, ?, ?, ?, ?)',
        [sanitizedName, sanitizedEmail, hashedPassword, userRole, sanitizedAddress]
      ),
      6000,
      'Timeout insertando nuevo usuario en la base de datos'
    );

    const userId = userResult.insertId;
    console.log('[Register Backend] ✅ Usuario insertado con ID:', userId);

    if (userRole === 'repostero') {
      console.log('[Register Backend] Creando perfil de repostero para usuario:', userId);
      await runWithTimeout(
        db.execute(
          'INSERT INTO baker_profiles (user_id, business_name, location, specialty, bio) VALUES (?, ?, ?, ?, ?)',
          [userId, sanitizedBusinessName || sanitizedName, sanitizedLocation, sanitizedSpecialty, sanitizedBio]
        ),
        6000,
        'Timeout creando perfil de repostero en la base de datos'
      );
      console.log('[Register Backend] ✅ Perfil de repostero creado');
    }

    console.log('[Register Backend] ========== REGISTRO COMPLETADO EXITOSAMENTE ==========');
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente. Verifica tu correo si es necesario antes de continuar.'
    });
  } catch (err) {
    console.error('[Register Backend] ❌ ERROR EN REGISTER:', err);
    console.error('[Register Backend] Error details:', {
      name: err.name,
      message: err.message,
      code: err.code,
      sqlState: err.sqlState
    });

    if (err.message && err.message.toLowerCase().includes('timeout')) {
      return res.status(504).json({
        success: false,
        error_code: 'DATABASE_TIMEOUT',
        message: 'El servidor tardó demasiado en responder la consulta. Por favor reintenta en unos momentos.'
      });
    }

    next(err);
  }
};

exports.login = async (req, res, next) => {
  console.log('[Login Backend] ========== INICIO LOGIN ==========');
  console.log('[Login Backend] IP:', req.ip || req.connection?.remoteAddress);
  console.log('[Login Backend] Body recibido:', { 
    email: req.body.email, 
    username: req.body.username,
    hasPassword: !!req.body.password
  });
  console.log('[Login Backend] Cookies:', Object.keys(req.cookies || {}));
  console.log('[Login Backend] Headers relevantes:', {
    'user-agent': req.headers['user-agent']?.substring(0, 50),
    'origin': req.headers.origin,
    'referer': req.headers.referer,
    'x-csrf-token': req.headers['x-csrf-token'] ? 'presente' : 'ausente'
  });
  
  const { email, username, password } = req.body;
  const rawIdentifier = (email || username || '').toString().trim();

  try {
    console.log('[Login Backend] Validando campos requeridos...');
    if (!rawIdentifier || !password) {
      console.log('[Login Backend] ❌ Campos obligatorios faltantes');
      return res.status(400).json({ success: false, message: 'Email/username y contraseña son obligatorios.' });
    }

    const isEmailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawIdentifier);
    console.log('[Login Backend] Es formato email?', isEmailLike);
    
    if (isEmailLike && !isValidEmail(rawIdentifier)) {
      console.log('[Login Backend] ❌ Email con formato inválido');
      return res.status(400).json({ success: false, message: 'Formato de correo electrónico inválido.' });
    }

    const normalizedIdentifier = rawIdentifier.toLowerCase();
    console.log('[Login Backend] Buscando usuario con identificador:', normalizedIdentifier);

    const [users] = await db.execute(
      'SELECT * FROM users WHERE email = ? OR name = ? LIMIT 1',
      [isEmailLike ? normalizedIdentifier : normalizedIdentifier, normalizedIdentifier]
    );

    console.log('[Login Backend] Usuarios encontrados:', users.length);

    if (users.length === 0) {
      console.log('[Login Backend] ❌ Usuario no encontrado');
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas. Verifica tus datos e intenta de nuevo.' 
      });
    }

    const user = users[0];
    console.log('[Login Backend] ✅ Usuario encontrado:', { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      hasPasswordHash: !!user.password_hash
    });

    console.log('[Login Backend] Verificando contraseña...');
    const isMatch = await bcrypt.compare(password, user.password_hash);
    console.log('[Login Backend] Contraseña válida?', isMatch);
    
    if (!isMatch) {
      console.log('[Login Backend] ❌ Contraseña incorrecta');
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas. Verifica tus datos e intenta de nuevo.' 
      });
    }

    console.log('[Login Backend] Generando tokens JWT...');
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
    );
    console.log('[Login Backend] ✅ Access token generado (expira en', ACCESS_TOKEN_EXPIRES_IN, ')');

    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      REFRESH_TOKEN_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );
    console.log('[Login Backend] ✅ Refresh token generado (expira en', REFRESH_TOKEN_EXPIRES_IN, ')');

    const refreshTokenExpiryMs = parseRefreshExpiry(REFRESH_TOKEN_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshTokenExpiryMs).toISOString().slice(0, 19).replace('T', ' ');
    console.log('[Login Backend] Refresh token expires at:', expiresAt);

    console.log('[Login Backend] Guardando refresh token en BD...');
    await db.execute(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshToken, expiresAt]
    );
    console.log('[Login Backend] ✅ Refresh token guardado en BD');

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
    console.log('[Login Backend] Configuración de cookies:', { 
      isProduction, 
      cookieDomain, 
      NODE_ENV: process.env.NODE_ENV 
    });
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
      domain: cookieDomain,
      ...(isProduction && {
        priority: 'high',
      })
    };

    const refreshCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshTokenExpiryMs,
      domain: cookieDomain,
      ...(isProduction && {
        priority: 'high',
      })
    };

    console.log('[Login Backend] Configurando cookies...');
    console.log('[Login Backend] Access token cookie options:', { 
      httpOnly: cookieOptions.httpOnly, 
      secure: cookieOptions.secure, 
      sameSite: cookieOptions.sameSite, 
      maxAge: cookieOptions.maxAge,
      domain: cookieOptions.domain || '(none)'
    });
    
    res.cookie('access_token', token, cookieOptions);
    res.cookie('refresh_token', refreshToken, refreshCookieOptions);
    console.log('[Login Backend] ✅ Cookies configuradas');

    console.log('[Login Backend] ========== LOGIN COMPLETADO EXITOSAMENTE ==========');
    console.log('[Login Backend] Enviando respuesta al cliente...');
    
    res.json({
      success: true,
      token,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[Login Backend] ❌ ERROR EN LOGIN:', err);
    console.error('[Login Backend] Error details:', {
      name: err.name,
      message: err.message,
      code: err.code,
      sqlState: err.sqlState
    });
    next(err);
  }
};

function parseRefreshExpiry(expiry) {
  if (!expiry || typeof expiry !== 'string') {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const match = expiry.match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return value * (multipliers[unit] || multipliers.d);
}

exports.refreshToken = async (req, res, next) => {
  console.log('[RefreshToken Backend] ========== INICIO REFRESH TOKEN ==========');
  const { refresh_token: refreshToken } = req.body;

  if (!refreshToken) {
    console.log('[RefreshToken Backend] ❌ refresh_token faltante');
    return res.status(400).json({ success: false, message: 'refresh_token es requerido.' });
  }

  console.log('[RefreshToken Backend] Token recibido (primeros 20 chars):', refreshToken.substring(0, 20) + '...');

  try {
    console.log('[RefreshToken Backend] Verificando JWT...');
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    console.log('[RefreshToken Backend] ✅ JWT válido. User ID:', decoded.id);
    
    console.log('[RefreshToken Backend] Buscando token en BD...');
    const [rows] = await db.execute(
      'SELECT id, revoked, expires_at FROM refresh_tokens WHERE token = ? LIMIT 1',
      [refreshToken]
    );

    console.log('[RefreshToken Backend] Tokens encontrados en BD:', rows.length);

    if (!rows.length || rows[0].revoked || new Date(rows[0].expires_at) <= new Date()) {
      console.log('[RefreshToken Backend] ❌ Token inválido, revocado o expirado');
      console.log('[RefreshToken Backend] Details:', { 
        found: rows.length > 0, 
        revoked: rows[0]?.revoked, 
        expired: rows[0] ? new Date(rows[0].expires_at) <= new Date() : 'N/A' 
      });
      return res.status(401).json({ success: false, message: 'Token de refresco inválido o expirado.' });
    }

    console.log('[RefreshToken Backend] ✅ Token válido en BD');
    const userPayload = { id: decoded.id, email: decoded.email, role: decoded.role };
    
    console.log('[RefreshToken Backend] Generando nuevo access token...');
    const token = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
    console.log('[RefreshToken Backend] ✅ Access token generado');
    
    console.log('[RefreshToken Backend] Generando nuevo refresh token...');
    const newRefreshToken = jwt.sign(userPayload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
    console.log('[RefreshToken Backend] ✅ Refresh token generado');

    const refreshTokenExpiryMs = parseRefreshExpiry(REFRESH_TOKEN_EXPIRES_IN);
    const newExpiresAt = new Date(Date.now() + refreshTokenExpiryMs).toISOString().slice(0, 19).replace('T', ' ');

    console.log('[RefreshToken Backend] Revocando token anterior en BD...');
    await db.execute('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [rows[0].id]);
    
    console.log('[RefreshToken Backend] Guardando nuevo refresh token en BD...');
    await db.execute(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [decoded.id, newRefreshToken, newExpiresAt]
    );
    console.log('[RefreshToken Backend] ✅ Nuevo token guardado en BD');

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000
    };

    const refreshCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshTokenExpiryMs
    };

    console.log('[RefreshToken Backend] Actualizando cookies...');
    res.cookie('access_token', token, cookieOptions);
    res.cookie('refresh_token', newRefreshToken, refreshCookieOptions);

    console.log('[RefreshToken Backend] ========== REFRESH TOKEN COMPLETADO ==========');
    res.json({
      success: true,
      token,
      refresh_token: newRefreshToken
    });
  } catch (err) {
    console.error('[RefreshToken Backend] ❌ ERROR EN REFRESH TOKEN:', err.name);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token de refresco expirado. Inicia sesión nuevamente.' });
    }

    return res.status(401).json({ success: false, message: 'Token de refresco inválido. Inicia sesión nuevamente.' });
  }
};

exports.logout = async (req, res, next) => {
  console.log('[Logout Backend] ========== INICIO LOGOUT ==========');
  console.log('[Logout Backend] Body:', req.body);
  
  const { refresh_token: refreshToken } = req.body;

  if (!refreshToken) {
    console.log('[Logout Backend] ❌ refresh_token faltante');
    return res.status(400).json({ success: false, message: 'refresh_token es requerido.' });
  }

  try {
    console.log('[Logout Backend] Revocando refresh token en BD...');
    const [result] = await db.execute('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?', [refreshToken]);
    console.log('[Logout Backend] Filas afectadas:', result.affectedRows);
    
    console.log('[Logout Backend] Limpiando cookies...');
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    
    console.log('[Logout Backend] ========== LOGOUT COMPLETADO ==========');
    res.json({ success: true, message: 'Sesión cerrada correctamente.' });
  } catch (err) {
    console.error('[Logout Backend] ❌ ERROR EN LOGOUT:', err);
    next(err);
  }
};

// Endpoint para obtener el usuario actual (verificar sesión)
exports.getMe = async (req, res, next) => {
  console.log('[GetMe Backend] ========== INICIO GET ME ==========');
  console.log('[GetMe Backend] req.user presente?', !!req.user);
  
  try {
    if (!req.user) {
      console.log('[GetMe Backend] ❌ No hay usuario en req.user');
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    console.log('[GetMe Backend] Buscando usuario ID:', req.user.id);
    const [users] = await db.execute(
      'SELECT id, name, email, role, address FROM users WHERE id = ?',
      [req.user.id]
    );

    console.log('[GetMe Backend] Usuarios encontrados:', users.length);

    if (users.length === 0) {
      console.log('[GetMe Backend] ❌ Usuario no encontrado en BD');
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const user = users[0];
    console.log('[GetMe Backend] ✅ Usuario encontrado:', { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    });

    let bakerProfile = null;
    if (user.role === 'repostero') {
      console.log('[GetMe Backend] Buscando perfil de repostero...');
      const [bakers] = await db.execute(
        'SELECT business_name, location, specialty, bio FROM baker_profiles WHERE user_id = ?',
        [user.id]
      );
      console.log('[GetMe Backend] Perfiles de repostero encontrados:', bakers.length);
      if (bakers.length > 0) {
        bakerProfile = bakers[0];
        console.log('[GetMe Backend] ✅ Perfil encontrado:', bakerProfile);
      }
    }

    console.log('[GetMe Backend] ========== GET ME COMPLETADO ==========');
    res.json({
      success: true,
      user: {
        ...user,
        ...(bakerProfile || {})
      }
    });
  } catch (err) {
    console.error('[GetMe Backend] ❌ ERROR EN GET ME:', err);
    next(err);
  }
};
