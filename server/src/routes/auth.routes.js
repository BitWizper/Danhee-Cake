const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { body } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { validateAllParameters, isDangerousValue } = require('../middleware/parameterValidator');
const { authLimiter, registerLimiter } = require('../middleware/rateLimiter');

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

// Rate limiters de auth aplicados en app.js antes del body parser
router.post('/register', registerLimiter, validateAllParameters, validateRegister, handleValidationErrors, authController.register);
router.post('/login', authLimiter, validateAllParameters, validateLogin, handleValidationErrors, authController.login);

module.exports = router;
