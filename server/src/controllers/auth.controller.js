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

exports.register = async (req, res, next) => {
  console.log('[REGISTER] ========== INICIO REGISTER ==========');
  console.log('[REGISTER] IP:', req.ip, '| User-Agent:', req.headers['user-agent']?.substring(0, 50));
  console.log('[REGISTER] Body recibido:', { 
    name: req.body.name, 
    email: req.body.email, 
    role: req.body.role || 'cliente',
    hasPassword: !!req.body.password 
  });
  console.log('[REGISTER] Headers:', { origin: req.headers.origin, referer: req.headers.referer });
  
  const { name, email, password, role, address, business_name, location, specialty, bio } = req.body;

  try {
    console.log('[REGISTER] Validando campos requeridos...');
    if (!name || !email || !password) {
      console.log('[REGISTER] ❌ FALLO: Campos faltantes - name:', !!name, 'email:', !!email, 'password:', !!password);
      return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
    }

    console.log('[REGISTER] Validando formato de email...');
    if (!isValidEmail(email)) {
      console.log('[REGISTER] ❌ FALLO: Email inválido:', email);
      return res.status(400).json({ success: false, message: 'Formato de correo electrónico inválido.' });
    }
    console.log('[REGISTER] ✓ Email válido');

    console.log('[REGISTER] Validando complejidad de contraseña...');
    if (!isValidPassword(password)) {
      console.log('[REGISTER] ❌ FALLO: Contraseña débil (longitud:', password.length + ')');
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres e incluir letras y números.' });
    }
    console.log('[REGISTER] ✓ Contraseña válida');

    // Validar role contra whitelist estricta (CRÍTICO para prevenir escalación de privilegios)
    const allowedRoles = ['cliente', 'repostero'];
    const userRole = role || 'cliente';
    if (!allowedRoles.includes(userRole)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rol no válido. Solo se permiten: cliente, repostero' 
      });
    }

    // Sanitizar inputs contra SQL Injection
    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedAddress = address ? sanitizeInput(address) : null;
    const sanitizedBusinessName = business_name ? sanitizeInput(business_name) : null;
    const sanitizedLocation = location ? sanitizeInput(location) : null;
    const sanitizedSpecialty = specialty ? sanitizeInput(specialty) : null;
    const sanitizedBio = bio ? sanitizeInput(bio) : null;

    // Validar nombre antes de sanitización
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El nombre es requerido.' });
    }

    // Validar longitud del nombre (mínimo 2 caracteres, máximo 150)
    if (name.trim().length < 2 || name.trim().length > 150) {
      return res.status(400).json({ success: false, message: 'El nombre debe tener entre 2 y 150 caracteres.' });
    }

    // Validar caracteres permitidos en nombre (whitelist menos restrictiva)
    // Permite: letras, números, espacios, apóstrofes, guiones, puntos, comas
    const validNamePattern = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s'\-.,]+$/;
    if (!validNamePattern.test(name.trim())) {
      return res.status(400).json({ success: false, message: 'El nombre contiene caracteres inválidos.' });
    }

    // Validar que el nombre no esté vacío después de sanitización
    if (!sanitizedName) {
      return res.status(400).json({ success: false, message: 'El nombre no puede estar vacío.' });
    }

    console.log('[REGISTER] Verificando si usuario ya existe...');
    const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ?', [sanitizedEmail]);
    if (existingUser.length > 0) {
      console.log('[REGISTER] ❌ FALLO: Usuario ya existe:', sanitizedEmail);
      return res.status(400).json({
        success: false,
        message: 'No se pudo completar el registro. Verifica tus datos e intenta de nuevo.'
      });
    }
    console.log('[REGISTER] ✓ Email disponible');

    console.log('[Register] Usuario no existe, procediendo a crear:', { name: sanitizedName, email: sanitizedEmail, role: userRole });

    console.log('[REGISTER] Hasheando contraseña...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log('[REGISTER] ✓ Contraseña hasheada');

    console.log('[REGISTER] Insertando usuario en BD...');
    const [userResult] = await db.execute(
      'INSERT INTO users (name, email, password_hash, role, address) VALUES (?, ?, ?, ?, ?)',
      [sanitizedName, sanitizedEmail, hashedPassword, userRole, sanitizedAddress]
    );

    const userId = userResult.insertId;
    console.log('[REGISTER] ✓ Usuario insertado con ID:', userId);

    if (userRole === 'repostero') {
      console.log('[REGISTER] Creando perfil de repostero para usuario:', userId);
      await db.execute(
        'INSERT INTO baker_profiles (user_id, business_name, location, specialty, bio) VALUES (?, ?, ?, ?, ?)',
        [userId, sanitizedBusinessName || sanitizedName, sanitizedLocation, sanitizedSpecialty, sanitizedBio]
      );
      console.log('[REGISTER] ✓ Perfil de repostero creado');
    }

    console.log('[REGISTER] ✅ REGISTER EXITOSO para usuario:', sanitizedEmail, '| Rol:', userRole, '| ID:', userId);
    console.log('[REGISTER] ========== FIN REGISTER ==========');
    
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente. Verifica tu correo si es necesario antes de continuar.'
    });
  } catch (err) {
    console.error('[REGISTER] ❌ ERROR EN REGISTER:', err.message);
    console.error('[REGISTER] Stack:', err.stack);
    next(err);
  }
};

exports.login = async (req, res, next) => {
  console.log('[LOGIN] ========== INICIO LOGIN ==========');
  console.log('[LOGIN] IP:', req.ip, '| User-Agent:', req.headers['user-agent']?.substring(0, 50));
  console.log('[LOGIN] Body recibido:', { email: req.body.email, username: req.body.username ? '[PROVIDED]' : '[MISSING]' });
  console.log('[LOGIN] Headers:', { origin: req.headers.origin, referer: req.headers.referer });
  
  const { email, username, password } = req.body;
  const rawIdentifier = (email || username || '').toString().trim();

  try {
    console.log('[LOGIN] Validando campos requeridos...');
    if (!rawIdentifier || !password) {
      console.log('[LOGIN] ❌ FALLO: Campos faltantes - identifier:', !!rawIdentifier, 'password:', !!password);
      return res.status(400).json({ success: false, message: 'Email/username y contraseña son obligatorios.' });
    }

    const isEmailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawIdentifier);
    if (isEmailLike && !isValidEmail(rawIdentifier)) {
      return res.status(400).json({ success: false, message: 'Formato de correo electrónico inválido.' });
    }

    const normalizedIdentifier = rawIdentifier.toLowerCase();

    // Buscar usuario por email o por nombre (compatibilidad con username)
    const [users] = await db.execute(
      'SELECT * FROM users WHERE email = ? OR name = ? LIMIT 1',
      [isEmailLike ? normalizedIdentifier : normalizedIdentifier, normalizedIdentifier]
    );

    console.log('[LOGIN] Buscando usuario en BD...');
    if (users.length === 0) {
      console.log('[LOGIN] ❌ FALLO: Usuario no encontrado para:', rawIdentifier.substring(0, 20));
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas. Verifica tus datos e intenta de nuevo.' 
      });
    }

    const user = users[0];
    console.log('[LOGIN] ✓ Usuario encontrado:', { id: user.id, email: user.email, role: user.role });

    console.log('[LOGIN] Verificando contraseña...');
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log('[LOGIN] ❌ FALLO: Contraseña incorrecta para usuario:', user.email);
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas. Verifica tus datos e intenta de nuevo.' 
      });
    }
    console.log('[LOGIN] ✓ Contraseña verificada correctamente');

    console.log('[LOGIN] Generando tokens JWT...');
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
    );
    console.log('[LOGIN] ✓ Access token generado (expira en:', ACCESS_TOKEN_EXPIRES_IN + ')');

    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      REFRESH_TOKEN_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );
    console.log('[LOGIN] ✓ Refresh token generado (expira en:', REFRESH_TOKEN_EXPIRES_IN + ')');

    const refreshTokenExpiryMs = parseRefreshExpiry(REFRESH_TOKEN_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshTokenExpiryMs).toISOString().slice(0, 19).replace('T', ' ');

    console.log('[LOGIN] Guardando refresh token en BD...');
    await db.execute(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshToken, expiresAt]
    );
    console.log('[LOGIN] ✓ Refresh token guardado en BD');

    // Enviar tokens como cookies httpOnly para mayor seguridad
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // Configurable por entorno
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax', // Cambiado de 'strict' a 'lax' para permitir cross-origin
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 minutos para access token
      domain: cookieDomain, // Restringir a dominio específico si está configurado
      // Additional security flags
      ...(isProduction && {
        // En producción, agregar flags adicionales
        priority: 'high', // Prioridad alta para cookies importantes
      })
    };

    const refreshCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax', // Cambiado de 'strict' a 'lax' para permitir cross-origin
      path: '/',
      maxAge: refreshTokenExpiryMs,
      domain: cookieDomain,
      ...(isProduction && {
        priority: 'high',
      })
    };

    console.log('[LOGIN] Estableciendo cookies...');
    res.cookie('access_token', token, cookieOptions);
    res.cookie('refresh_token', refreshToken, refreshCookieOptions);
    console.log('[LOGIN] ✓ Cookies establecidas:', { 
      access_token_domain: cookieOptions.domain || 'current', 
      access_token_sameSite: cookieOptions.sameSite,
      refresh_token_domain: refreshCookieOptions.domain || 'current',
      refresh_token_sameSite: refreshCookieOptions.sameSite
    });

    console.log('[LOGIN] ✅ LOGIN EXITOSO para usuario:', user.email, '| Rol:', user.role);
    console.log('[LOGIN] ========== FIN LOGIN ==========');
    
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
    console.error('[LOGIN] ❌ ERROR EN LOGIN:', err.message);
    console.error('[LOGIN] Stack:', err.stack);
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
  const { refresh_token: refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'refresh_token es requerido.' });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    const [rows] = await db.execute(
      'SELECT id, revoked, expires_at FROM refresh_tokens WHERE token = ? LIMIT 1',
      [refreshToken]
    );

    if (!rows.length || rows[0].revoked || new Date(rows[0].expires_at) <= new Date()) {
      return res.status(401).json({ success: false, message: 'Token de refresco inválido o expirado.' });
    }

    const userPayload = { id: decoded.id, email: decoded.email, role: decoded.role };
    const token = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
    const newRefreshToken = jwt.sign(userPayload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    const refreshTokenExpiryMs = parseRefreshExpiry(REFRESH_TOKEN_EXPIRES_IN);
    const newExpiresAt = new Date(Date.now() + refreshTokenExpiryMs).toISOString().slice(0, 19).replace('T', ' ');

    await db.execute('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [rows[0].id]);
    await db.execute(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [decoded.id, newRefreshToken, newExpiresAt]
    );

    // Actualizar cookies con nuevos tokens
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax', // Cambiado de 'strict' a 'lax' para permitir cross-origin
      path: '/',
      maxAge: 15 * 60 * 1000 // 15 minutos
    };

    const refreshCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax', // Cambiado de 'strict' a 'lax' para permitir cross-origin
      path: '/',
      maxAge: refreshTokenExpiryMs
    };

    res.cookie('access_token', token, cookieOptions);
    res.cookie('refresh_token', newRefreshToken, refreshCookieOptions);

    res.json({
      success: true,
      token, // Mantener por compatibilidad temporal
      refresh_token: newRefreshToken // Mantener por compatibilidad temporal
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token de refresco expirado. Inicia sesión nuevamente.' });
    }

    return res.status(401).json({ success: false, message: 'Token de refresco inválido. Inicia sesión nuevamente.' });
  }
};

exports.logout = async (req, res, next) => {
  const { refresh_token: refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'refresh_token es requerido.' });
  }

  try {
    await db.execute('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?', [refreshToken]);
    
    // Limpiar cookies
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    
    res.json({ success: true, message: 'Sesión cerrada correctamente.' });
  } catch (err) {
    next(err);
  }
};

// Endpoint para obtener el usuario actual (verificar sesión)
exports.getMe = async (req, res, next) => {
  try {
    // Este endpoint requiere authMiddleware que adjunta req.user
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    // Obtener datos actualizados del usuario
    const [users] = await db.execute(
      'SELECT id, name, email, role, address FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const user = users[0];

    // Si es repostero, obtener perfil adicional
    let bakerProfile = null;
    if (user.role === 'repostero') {
      const [bakers] = await db.execute(
        'SELECT business_name, location, specialty, bio FROM baker_profiles WHERE user_id = ?',
        [user.id]
      );
      if (bakers.length > 0) {
        bakerProfile = bakers[0];
      }
    }

    res.json({
      success: true,
      user: {
        ...user,
        ...(bakerProfile || {})
      }
    });
  } catch (err) {
    next(err);
  }
};
