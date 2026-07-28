const express = require('express');
const router = express.Router();
const cakesController = require('../controllers/cakes.controller');
const { query, param } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { readLimiter } = require('../middleware/rateLimiter');
const { validateAllParameters, isDangerousValue } = require('../middleware/parameterValidator');

// ============================================================
// VALIDACIÓN DE PARÁMETROS
// ============================================================

// Validación para parámetros de consulta en getAll
const validateCakesQuery = [
  query('category')
    .optional()
    .trim()
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s-]+$/).withMessage('category contiene caracteres inválidos')
    .isLength({ max: 100 }).withMessage('category máximo 100 caracteres')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'query.category')) {
        throw new Error('category contiene contenido sospechoso');
      }
      return true;
    }),
  query('baker')
    .optional()
    .isInt({ min: 1 }).withMessage('baker debe ser número entero positivo')
    .toInt(),
  query('featured')
    .optional()
    .isIn(['true', 'false', '0', '1']).withMessage('featured debe ser true o false'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 }).withMessage('limit entre 1-500')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('offset debe ser positivo')
    .toInt(),
];

// Validación para parámetros de ruta
const validateCakeId = [
  param('id')
    .isInt({ min: 1 }).withMessage('id debe ser número entero positivo')
    .toInt(),
];

// ============================================================
// RUTAS
// ============================================================

router.get('/', readLimiter, validateAllParameters, validateCakesQuery, handleValidationErrors, cakesController.getAll);
router.get('/:id', validateAllParameters, validateCakeId, handleValidationErrors, cakesController.getById);

module.exports = router;
