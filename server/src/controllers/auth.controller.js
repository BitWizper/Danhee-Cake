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
  const { name, email, password, role, address, business_name, location, specialty, bio } = req.body;

  try {
    // Validar campos requeridos
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
    }

    // Validar formato de email
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Formato de correo electrónico inválido.' });
    }

    // Validar complejidad de contraseña
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres e incluir letras y números.' });
    }

    // Sanitizar inputs contra SQL Injection
    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedAddress = address ? sanitizeInput(address) : null;
    const sanitizedBusinessName = business_name ? sanitizeInput(business_name) : null;
    const sanitizedLocation = location ? sanitizeInput(location) : null;
    const sanitizedSpecialty = specialty ? sanitizeInput(specialty) : null;
    const sanitizedBio = bio ? sanitizeInput(bio) : null;

    // Validar que el nombre no esté vacío después de sanitización
    if (!sanitizedName) {
      return res.status(400).json({ success: false, message: 'El nombre no puede estar vacío.' });
    }

    // Verificar si el usuario ya existe
    const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ?', [sanitizedEmail]);
    if (existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo completar el registro. Verifica tus datos e intenta de nuevo.'
      });
    }

    // Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertar usuario con consultas parametrizadas
    const [userResult] = await db.execute(
      'INSERT INTO users (name, email, password_hash, role, address) VALUES (?, ?, ?, ?, ?)',
      [sanitizedName, sanitizedEmail, hashedPassword, role || 'cliente', sanitizedAddress]
    );

    const userId = userResult.insertId;

    // Si es repostero, crear perfil
    if (role === 'repostero') {
      await db.execute(
        'INSERT INTO baker_profiles (user_id, business_name, location, specialty, bio) VALUES (?, ?, ?, ?, ?)',
        [userId, sanitizedBusinessName || sanitizedName, sanitizedLocation, sanitizedSpecialty, sanitizedBio]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente. Verifica tu correo si es necesario antes de continuar.'
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  // Aceptar email o username como identificador de login
  const { email, username, password } = req.body;
  const rawIdentifier = (email || username || '').toString().trim();

  try {
    // Validar campos requeridos
    if (!rawIdentifier || !password) {
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

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas. Verifica tus datos e intenta de nuevo.' });
    }

    const user = users[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas. Verifica tus datos e intenta de nuevo.' });
    }

    // Generar tokens
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      REFRESH_TOKEN_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    const refreshTokenExpiryMs = parseRefreshExpiry(REFRESH_TOKEN_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshTokenExpiryMs).toISOString().slice(0, 19).replace('T', ' ');

    await db.execute(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshToken, expiresAt]
    );

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

    res.json({
      success: true,
      token,
      refresh_token: newRefreshToken
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
    res.json({ success: true, message: 'Sesión cerrada correctamente.' });
  } catch (err) {
    next(err);
  }
};
