const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { validateAllParameters } = require('../middleware/parameterValidator');
const { generateOxxoTicket } = require('../controllers/payments.controller');

const validateOxxoTicket = [
  body('orderId')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('orderId debe tener entre 1 y 100 caracteres'),
  body('amount')
    .notEmpty().withMessage('amount es requerido')
    .isFloat({ min: 0.01, max: 1000000 }).withMessage('amount debe ser un número positivo válido')
];

router.post('/oxxo-ticket', validateAllParameters, validateOxxoTicket, handleValidationErrors, generateOxxoTicket);

module.exports = router;
