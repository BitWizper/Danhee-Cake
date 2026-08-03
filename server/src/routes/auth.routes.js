const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { body } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { validateAllParameters, isDangerousValue } = require('../middleware/parameterValidator');
const { authLimiter, registerLimiter, publicLimiter, ipBlocker } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');
const { csrfProtection, csrfTokenGenerator } = require('../middleware/csrfProtection');

const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('El nombre solo puede contener letras y espacios')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'body.name')) {
        throw new Error('El nombre contiene contenido sospechoso');
      }
      return true;
    }),
  body('email')
    .trim()
    .isEmail().withMessage('El email debe ser válido')
    .normalizeEmail()
    .isLength({ max: 100 }).withMessage('El email es demasiado largo')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'body.email')) {
        throw new Error('El email contiene contenido sospechoso');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8, max: 128 }).withMessage('La contraseña debe tener entre 8 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('La contraseña debe contener al menos una mayúscula, una minúscula y un número')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'body.password')) {
        throw new Error('La contraseña contiene contenido sospechoso');
      }
      return true;
    }),
  body('role')
    .optional()
    .isIn(['cliente', 'repostero']).withMessage('El rol debe ser cliente o repostero'),
];

const validateLogin = [
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail().withMessage('El email debe ser válido')
    .normalizeEmail(),
  body('username')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('El username debe tener entre 3 y 100 caracteres')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'body.username')) {
        throw new Error('El username contiene contenido sospechoso');
      }
      return true;
    }),
  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 1 }).withMessage('La contraseña no puede estar vacía'),
  body().custom((value, { req }) => {
    const hasEmail = Boolean(req.body.email && String(req.body.email).trim());
    const hasUsername = Boolean(req.body.username && String(req.body.username).trim());
    if (!hasEmail && !hasUsername) {
      throw new Error('Se requiere email o username para iniciar sesión');
    }
    return true;
  })
];

const validateRefreshToken = [
  body('refresh_token')
    .trim()
    .notEmpty().withMessage('refresh_token es requerido')
    .isLength({ min: 32 }).withMessage('refresh_token inválido')
];

// Middleware pipeline limpio para auth (los limiters globales, ipBlocker, CSRF y parameterValidator corren en app.js)
router.post('/register', validateRegister, handleValidationErrors, authController.register);
router.post('/login', validateLogin, handleValidationErrors, authController.login);
router.post('/refresh', validateRefreshToken, handleValidationErrors, authController.refreshToken);
router.post('/logout', validateRefreshToken, handleValidationErrors, authController.logout);
router.get('/me', authMiddleware, authController.getMe);
router.get('/csrf-token', csrfTokenGenerator, (req, res) => {
  const csrfToken = res.getHeader('X-CSRF-Token');
  console.log('[CSRF] /csrf-token issuing token:', csrfToken ? `${csrfToken.substring(0, 8)}...` : 'null');
  res.json({ csrf_token: csrfToken });
});

module.exports = router;
