const express = require('express');
const router = express.Router();
const bakersController = require('../controllers/bakers.controller');
const { authMiddleware, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

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
router.post('/cakes', authMiddleware, authorize('repostero'), upload.single('image'), bakersController.addCake);
router.put('/cakes/:id', authMiddleware, authorize('repostero'), upload.single('image'), bakersController.updateCake);
router.delete('/cakes/:id', authMiddleware, authorize('repostero'), bakersController.deleteCake);
router.get('/profile/me', authMiddleware, authorize('repostero'), bakersController.getMyProfile);
router.put('/profile', authMiddleware, authorize('repostero'), bakersController.updateProfile);

// Esta ruta se mantiene al final para evitar conflictos con rutas estáticas como /cakes o /stats
router.get('/:id', bakersController.getProfile);  // Obtener un repostero específico

module.exports = router;