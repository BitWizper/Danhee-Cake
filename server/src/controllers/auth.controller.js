const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res, next) => {
  const { name, email, password, role, address, business_name, location, specialty, bio } = req.body;

  try {
    // Verificar si el usuario ya existe
    const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(409).json({ success: false, message: 'El correo electrónico ya está registrado.' });
    }

    // Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertar usuario
    const [userResult] = await db.execute(
      'INSERT INTO users (name, email, password_hash, role, address) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role || 'cliente', address || null]
    );

    const userId = userResult.insertId;

    // Si es repostero, crear perfil
    if (role === 'repostero') {
      await db.execute(
        'INSERT INTO baker_profiles (user_id, business_name, location, specialty, bio) VALUES (?, ?, ?, ?, ?)',
        [userId, business_name || name, location || null, specialty || null, bio || null]
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
  const { email, password } = req.body;

  try {
    // Buscar usuario
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
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
