const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { body } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { authLimiter, registerLimiter } = require('../middleware/rateLimiter'); // Importar los limiters

const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('El nombre solo puede contener letras y espacios'),
  body('email')
    .trim()
    .isEmail().withMessage('El email debe ser válido')
    .normalizeEmail()
    .isLength({ max: 100 }).withMessage('El email es demasiado largo'),
  body('password')
    .isLength({ min: 8, max: 128 }).withMessage('La contraseña debe tener entre 8 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('La contraseña debe contener al menos una mayúscula, una minúscula y un número'),
  body('role')
    .optional()
    .isIn(['cliente', 'repostero']).withMessage('El rol debe ser cliente o repostero'),
];

const validateLogin = [
  body('email')
    .trim()
    .isEmail().withMessage('El email debe ser válido')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 1 }).withMessage('La contraseña no puede estar vacía'),
];

// Aplicar rate limiters directamente en las rutas
router.post('/register', registerLimiter, validateRegister, handleValidationErrors, authController.register);
router.post('/login', authLimiter, validateLogin, handleValidationErrors, authController.login);

module.exports = router;
