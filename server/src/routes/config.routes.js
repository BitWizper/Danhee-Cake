const express = require('express');
const router = express.Router();
const { getConfig } = require('../controllers/config.controller');
const { authLimiter } = require('../middleware/rateLimiter');

// Rate limiting específico para /api/config
// Más restrictivo que otros endpoints para prevenir abuso
router.use(authLimiter);

// Endpoint para obtener configuración del API (solo GET)
router.get('/', getConfig);

module.exports = router;
