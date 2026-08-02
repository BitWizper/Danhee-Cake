const express = require('express');
const { askChatbot, getChatHistory, deleteChatHistory } = require('../controllers/chat.controller');
const { body, query } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { authMiddleware } = require('../middleware/auth');
const { validateAllParameters, isDangerousValue } = require('../middleware/parameterValidator');
const { chatAbuseGuard } = require('../middleware/chatAbuseGuard');
const { chatLimiter, ipBlocker, writeLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// ============================================================
// VALIDACIÓN DE PARÁMETROS
// ============================================================

// Validación para mensajes del chatbot
const validateChatMessage = [
  body('message')
    .trim()
    .notEmpty().withMessage('El mensaje es requerido')
    .isLength({ min: 1, max: 2000 }).withMessage('El mensaje debe tener entre 1 y 2000 caracteres')
    .matches(/^[\x20-\x7EáéíóúÁÉÍÓÚñÑ¿¡.,!?;:'"()\s\-]+$/).withMessage('El mensaje contiene caracteres inválidos')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'body.message')) {
        throw new Error('El mensaje contiene contenido sospechoso');
      }
      return true;
    }),
];

// Validación para parámetros de historial
const validateHistoryParams = [
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
// RUTAS PROTEGIDAS CON AUTENTICACIÓN
// ============================================================

router.post("/",
  authMiddleware,
  ipBlocker,
  chatLimiter,
  chatAbuseGuard,
  validateAllParameters,
  validateChatMessage,
  handleValidationErrors,
  askChatbot
);

router.get("/history",
  authMiddleware,
  ipBlocker,
  validateAllParameters,
  validateHistoryParams,
  handleValidationErrors,
  getChatHistory
);

router.delete("/history",
  authMiddleware,
  ipBlocker,
  writeLimiter,
  validateAllParameters,
  handleValidationErrors,
  deleteChatHistory
);

module.exports = router;