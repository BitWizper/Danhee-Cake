const express = require('express');
const router = express.Router();
const bakersController = require('../controllers/bakers.controller');
const { authMiddleware, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Rutas protegidas (Requieren ser el propio repostero)
router.get('/stats', authMiddleware, authorize('repostero'), bakersController.getStats);
router.get('/appointments', authMiddleware, authorize('repostero'), bakersController.getAppointments);
router.get('/cakes', authMiddleware, authorize('repostero'), bakersController.getMyCakes);
router.post('/cakes', authMiddleware, authorize('repostero'), upload.single('image'), bakersController.addCake);
router.put('/cakes/:id', authMiddleware, authorize('repostero'), upload.single('image'), bakersController.updateCake);
router.delete('/cakes/:id', authMiddleware, authorize('repostero'), bakersController.deleteCake);
router.get('/profile/me', authMiddleware, authorize('repostero'), bakersController.getMyProfile);
router.put('/profile', authMiddleware, authorize('repostero'), bakersController.updateProfile);

// Ruta pública para ver perfiles (DEBE IR AL FINAL)
router.get('/:id', bakersController.getProfile);

module.exports = router;
