const express = require('express');
const router = express.Router();
const bakersController = require('../controllers/bakers.controller');
const { authMiddleware, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadWithSignatureCheck } = require('../middleware/upload');
const { body, param } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');

// ============================================
// RUTAS PÚBLICAS (NO requieren autenticación)
// ============================================
router.get('/', bakersController.getAllPublic);  // ← Obtener TODOS los reposteros

// ============================================
// RUTAS PROTEGIDAS (Requieren ser repostero autenticado)
// ============================================
router.get('/stats', authMiddleware, authorize('repostero'), bakersController.getStats);
router.get('/appointments', authMiddleware, authorize('repostero'), bakersController.getAppointments);
router.put('/appointments/:id/status', authMiddleware, authorize('repostero'), bakersController.updateAppointmentStatus);
router.get('/cakes', authMiddleware, authorize('repostero'), bakersController.getMyCakes);
router.post('/cakes',
  authMiddleware,
  authorize('repostero'),
  uploadWithSignatureCheck('image'),
  [
    body('name').trim().notEmpty().withMessage('El nombre es requerido').isLength({ max: 100 }).withMessage('Nombre máximo 100 caracteres'),
    body('description').optional().isLength({ max: 1000 }).withMessage('Descripción máximo 1000 caracteres'),
    body('price').optional().isFloat({ min: 0 }).withMessage('El precio debe ser positivo'),
    body('category_id').optional().isInt().withMessage('category_id debe ser un entero'),
    body('is_featured').optional().isBoolean().withMessage('is_featured debe ser booleano')
  ],
  handleValidationErrors,
  bakersController.addCake
);
router.put('/cakes/:id',
  authMiddleware,
  authorize('repostero'),
  uploadWithSignatureCheck('image'),
  [
    param('id').isInt().withMessage('id debe ser un entero'),
    body('name').optional().trim().notEmpty().withMessage('El nombre es requerido').isLength({ max: 100 }).withMessage('Nombre máximo 100 caracteres'),
    body('description').optional().isLength({ max: 1000 }).withMessage('Descripción máximo 1000 caracteres'),
    body('price').optional().isFloat({ min: 0 }).withMessage('El precio debe ser positivo'),
    body('category_id').optional().isInt().withMessage('category_id debe ser un entero'),
    body('is_featured').optional().isBoolean().withMessage('is_featured debe ser booleano')
  ],
  handleValidationErrors,
  bakersController.updateCake
);
router.delete('/cakes/:id',
  authMiddleware,
  authorize('repostero'),
  [param('id').isInt().withMessage('id debe ser un entero')],
  handleValidationErrors,
  bakersController.deleteCake
);
router.get('/profile/me', authMiddleware, authorize('repostero'), bakersController.getMyProfile);
router.put('/profile',
  authMiddleware,
  authorize('repostero'),
  [
    body('business_name').optional().trim().isLength({ max: 100 }).withMessage('business_name máximo 100 caracteres'),
    body('location').optional().trim().isLength({ max: 200 }).withMessage('location máximo 200 caracteres'),
    body('specialty').optional().trim().isLength({ max: 100 }).withMessage('specialty máximo 100 caracteres'),
    body('bio').optional().trim().isLength({ max: 500 }).withMessage('bio máximo 500 caracteres'),
    body('business_hours').optional().trim().isLength({ max: 200 }).withMessage('business_hours máximo 200 caracteres')
  ],
  handleValidationErrors,
  bakersController.updateProfile
);

// Esta ruta se mantiene al final para evitar conflictos con rutas estáticas como /cakes o /stats
router.get('/:id',
  [param('id').isInt().withMessage('id debe ser un entero')],
  handleValidationErrors,
  bakersController.getProfile
);  // Obtener un repostero específico

module.exports = router;