const express = require('express');
const { getChatHistory, deleteChatHistory } = require('../controllers/chat.controller');
const { query } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { authMiddleware } = require('../middleware/auth');
const { validateAllParameters } = require('../middleware/parameterValidator');
const { ipBlocker, writeLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

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