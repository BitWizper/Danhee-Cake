const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
      return res.status(409).json({ success: false, message: 'El correo electrónico ya está registrado.' });
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
      message: 'Usuario registrado exitosamente.'
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  // Aceptar username como alias de email para compatibilidad
  const { email, username, password } = req.body;
  const loginEmail = email || username;

  try {
    // Validar campos requeridos
    if (!loginEmail || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña son obligatorios.' });
    }

    // Validar formato de email
    if (!isValidEmail(loginEmail)) {
      return res.status(400).json({ success: false, message: 'Formato de correo electrónico inválido.' });
    }

    // Buscar usuario
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [loginEmail.toLowerCase().trim()]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    const user = users[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    // Generar JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      token,
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
