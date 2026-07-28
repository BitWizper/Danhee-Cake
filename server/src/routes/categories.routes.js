const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categories.controller');
const { query } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { readLimiter, publicLimiter, ipBlocker } = require('../middleware/rateLimiter');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { validateAllParameters, isDangerousValue } = require('../middleware/parameterValidator');

// ============================================================
// VALIDACIÓN DE PARÁMETROS
// ============================================================

// Validación para parámetros de consulta
const validateQueryParams = [
  query('active')
    .optional()
    .isIn(['true', 'false', '0', '1']).withMessage('active debe ser true o false')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'query.active')) {
        throw new Error('active contiene contenido sospechoso');
      }
      return true;
    }),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 }).withMessage('limit entre 1-500')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('offset debe ser positivo')
    .toInt(),
];

// ============================================================
// RUTAS
// ============================================================

// Allow optional authentication: anonymous users can read categories
const publicRateIfAnonymous = (req, res, next) => {
  if (!req.user) return publicLimiter(req, res, next);
  return next();
};

router.get('/', optionalAuth, ipBlocker, publicRateIfAnonymous, readLimiter, validateAllParameters, validateQueryParams, handleValidationErrors, categoriesController.getAll);

// Protected category routes can be added below; current explorer list remains public.
router.use(authMiddleware);

module.exports = router;
