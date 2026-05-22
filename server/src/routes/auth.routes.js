const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { body } = require('express-validator');

const validateRegister = [
  body('name').notEmpty().withMessage('El nombre es requerido'),
  body('email').isEmail().withMessage('El email debe ser válido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
];

const validateLogin = [
  body('email').isEmail().withMessage('El email debe ser válido'),
  body('password').notEmpty().withMessage('La contraseña es requerida'),
];

router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);

module.exports = router;
