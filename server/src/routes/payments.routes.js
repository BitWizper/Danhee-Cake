const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { validateAllParameters, isDangerousValue } = require('../middleware/parameterValidator');
const { authMiddleware } = require('../middleware/auth');
const { generateOxxoTicket } = require('../controllers/payments.controller');
const { paymentGuard } = require('../middleware/paymentGuard');
const { writeLimiter, ipBlocker } = require('../middleware/rateLimiter');

const validateOxxoTicket = [
  body('orderId')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('orderId debe tener entre 1 y 100 caracteres')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'body.orderId')) {
        throw new Error('orderId contiene contenido sospechoso');
      }
      return true;
    }),
  body('amount')
    .notEmpty().withMessage('amount es requerido')
    .isFloat({ min: 0.01, max: 1000000 }).withMessage('amount debe ser un número positivo válido')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'body.amount')) {
        throw new Error('amount contiene contenido sospechoso');
      }
      return true;
    })
];

router.use(authMiddleware);

router.post('/oxxo-ticket', ipBlocker, writeLimiter, paymentGuard, validateAllParameters, validateOxxoTicket, handleValidationErrors, generateOxxoTicket);

module.exports = router;
