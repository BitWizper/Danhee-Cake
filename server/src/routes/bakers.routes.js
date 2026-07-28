const express = require('express');
const router = express.Router();
const bakersController = require('../controllers/bakers.controller');
const { authMiddleware, authorize } = require('../middleware/auth');
const { bakersLimiter, readLimiter, writeLimiter } = require('../middleware/rateLimiter');
const upload = require('../middleware/upload');
const { uploadWithSignatureCheck } = require('../middleware/upload');
const { body, param, query } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { validateAllParameters } = require('../middleware/parameterValidator');

// ============================================================
// VALIDACIÓN DE PARÁMETROS
// ============================================================

const validateBakerId = [
  param('id')
    .isInt({ min: 1 }).withMessage('id debe ser número entero positivo')
    .toInt(),
];

const validateCakePostBody = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 100 }).withMessage('Nombre entre 2-100 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s-]+$/).withMessage('Nombre con caracteres inválidos'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Descripción máximo 1000 caracteres'),
  body('price')
    .optional()
    .isFloat({ min: 0, max: 999999 }).withMessage('Precio debe ser número positivo'),
  body('category_id')
    .optional()
    .isInt({ min: 1 }).withMessage('category_id debe ser número entero positivo'),
  body('is_featured')
    .optional()
    .isBoolean().withMessage('is_featured debe ser booleano')
];

const validateCakePutBody = [
  param('id')
    .isInt({ min: 1 }).withMessage('id debe ser número entero positivo')
    .toInt(),
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 100 }).withMessage('Nombre entre 2-100 caracteres'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Descripción máximo 1000 caracteres'),
  body('price')
    .optional()
    .isFloat({ min: 0, max: 999999 }).withMessage('Precio debe ser número positivo'),
  body('category_id')
    .optional()
    .isInt({ min: 1 }).withMessage('category_id debe ser número entero positivo'),
  body('is_featured')
    .optional()
    .isBoolean().withMessage('is_featured debe ser booleano')
];

const validateProfileBody = [
  body('business_name')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('business_name máximo 100 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s-]+$/).withMessage('Nombre con caracteres inválidos'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('location máximo 200 caracteres'),
  body('specialty')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('specialty máximo 100 caracteres'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('bio máximo 500 caracteres'),
  body('business_hours')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('business_hours máximo 200 caracteres')
];

const validateQueryParams = [
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
// RUTAS PÚBLICAS (NO requieren autenticación)
// ============================================================

router.get('/',
  bakersLimiter,
  validateAllParameters,
  validateQueryParams,
  handleValidationErrors,
  bakersController.getAllPublic
);

// ============================================================
// RUTAS PROTEGIDAS (Requieren ser repostero autenticado)
// ============================================================

router.get('/stats',
  readLimiter,
  authMiddleware,
  authorize('repostero'),
  validateAllParameters,
  handleValidationErrors,
  bakersController.getStats
);

router.get('/appointments',
  readLimiter,
  authMiddleware,
  authorize('repostero', 'admin'),
  validateAllParameters,
  validateQueryParams,
  handleValidationErrors,
  bakersController.getAppointments
);

router.put('/appointments/:id/status',
  writeLimiter,
  authMiddleware,
  authorize('repostero'),
  validateAllParameters,
  [param('id').isInt({ min: 1 }).withMessage('id debe ser número entero positivo').toInt()],
  handleValidationErrors,
  bakersController.updateAppointmentStatus
);

router.get('/cakes',
  readLimiter,
  authMiddleware,
  authorize('repostero'),
  validateAllParameters,
  validateQueryParams,
  handleValidationErrors,
  bakersController.getMyCakes
);

router.post('/cakes',
  writeLimiter,
  authMiddleware,
  authorize('repostero'),
  uploadWithSignatureCheck('image'),
  validateAllParameters,
  validateCakePostBody,
  handleValidationErrors,
  bakersController.addCake
);

router.put('/cakes/:id',
  writeLimiter,
  authMiddleware,
  authorize('repostero'),
  uploadWithSignatureCheck('image'),
  validateAllParameters,
  validateCakePutBody,
  handleValidationErrors,
  bakersController.updateCake
);

router.delete('/cakes/:id',
  writeLimiter,
  authMiddleware,
  authorize('repostero'),
  validateAllParameters,
  [param('id').isInt({ min: 1 }).withMessage('id debe ser número entero positivo').toInt()],
  handleValidationErrors,
  bakersController.deleteCake
);

router.get('/profile/me',
  readLimiter,
  authMiddleware,
  authorize('repostero'),
  validateAllParameters,
  handleValidationErrors,
  bakersController.getMyProfile
);

router.put('/profile',
  writeLimiter,
  authMiddleware,
  authorize('repostero'),
  validateAllParameters,
  validateProfileBody,
  handleValidationErrors,
  bakersController.updateProfile
);

// Esta ruta se mantiene al final para evitar conflictos con rutas estáticas como /cakes o /stats
router.get('/:id',
  bakersLimiter,
  validateAllParameters,
  validateBakerId,
  handleValidationErrors,
  bakersController.getProfile
);

module.exports = router;