const express = require('express');
const { askChatbot, getChatHistory, deleteChatHistory } = require('../controllers/chat.controller');
const { body, query } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Validación para mensajes del chatbot
const validateChatMessage = [
  body('message')
    .trim()
    .notEmpty().withMessage('El mensaje es requerido')
    .isLength({ min: 1, max: 2000 }).withMessage('El mensaje debe tener entre 1 y 2000 caracteres')
    .matches(/^[\x20-\x7EáéíóúÁÉÍÓÚñÑ¿¡.,!?;:'"()\s-]+$/).withMessage('El mensaje contiene caracteres inválidos'),
];

// Validación para parámetros de historial
const validateHistoryParams = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit debe ser entre 1 y 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset debe ser un número positivo'),
];

// Rutas protegidas con autenticación
router.post("/", authMiddleware, validateChatMessage, handleValidationErrors, askChatbot);
router.get("/history", authMiddleware, validateHistoryParams, handleValidationErrors, getChatHistory);
router.delete("/history", authMiddleware, handleValidationErrors, deleteChatHistory);

module.exports = router;