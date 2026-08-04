// routes/appointments.routes.js
const express = require('express');
const router = express.Router();
const appointmentsController = require('../controllers/appointments.controller');
const { authMiddleware } = require('../middleware/auth');
const { body, param, query } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');
const { validateAllParameters, isDangerousValue } = require('../middleware/parameterValidator');
const { readLimiter, writeLimiter, publicLimiter, ipBlocker } = require('../middleware/rateLimiter');

// ============================================================
// VALIDACIÓN DE PARÁMETROS
// ============================================================

const validateBakerId = [
  param('baker_id')
    .isInt({ min: 1 }).withMessage('baker_id debe ser número entero positivo')
    .toInt(),
];

const validateDate = [
  param('date')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date debe ser formato YYYY-MM-DD'),
];

const validateAppointmentBody = [
  body('baker_id')
    .isInt({ min: 1 }).withMessage('baker_id debe ser número entero positivo')
    .toInt(),
  body('date')
    .isISO8601().withMessage('date debe ser fecha válida ISO8601'),
  body('time_slot')
    .trim()
    .notEmpty().withMessage('time_slot requerido')
    .matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/).withMessage('time_slot debe ser HH:MM válido (00:00-23:59)')
    .custom((value) => {
      const [, minutes] = value.split(':').map(Number);
      if (minutes % 15 !== 0) {
        throw new Error('time_slot debe ser en intervalos de 15 minutos (00, 15, 30, 45)');
      }
      return true;
    }),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('notes máximo 500 caracteres')
    .custom((value) => {
      if (typeof value === 'string' && isDangerousValue(value, 'body.notes')) {
        throw new Error('notes contiene contenido sospechoso');
      }
      return true;
    }),
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
// RUTAS PÚBLICAS (sin autenticación)
// ============================================================

// Ruta interna para citas agendadas por el chatbot IA (solo localhost, sin JWT)
// El client_id viene decodificado del JWT por chat.controller y enviado por Python RAG
router.post('/internal',
  validateAllParameters,
  validateAppointmentBody,
  handleValidationErrors,
  appointmentsController.createInternal
);

// Ruta para solicitudes de invitados (no autenticados)
router.post('/guest',
  ipBlocker,
  publicLimiter,
  writeLimiter,
  validateAllParameters,
  validateAppointmentBody,
  handleValidationErrors,
  appointmentsController.createGuest
);

// Ruta pública para verificar disponibilidad de un repostero
router.get('/baker/:baker_id/date/:date',
  ipBlocker,
  publicLimiter,
  readLimiter,
  validateAllParameters,
  validateBakerId,
  validateDate,
  handleValidationErrors,
  appointmentsController.getBakerAvailability
);

// ============================================================
// RUTAS PROTEGIDAS (requieren JWT)
// ============================================================
router.use(authMiddleware);

// Crear nueva cita (usuario autenticado)
router.post('/',
  ipBlocker,
  writeLimiter,
  validateAllParameters,
  validateAppointmentBody,
  handleValidationErrors,
  appointmentsController.create
);

// Obtener citas del usuario autenticado
router.get('/my-appointments',
  ipBlocker,
  readLimiter,
  validateAllParameters,
  validateQueryParams,
  handleValidationErrors,
  appointmentsController.getUserAppointments
);

// Cancelar una cita (solo el dueño)
router.delete('/:id',
  ipBlocker,
  writeLimiter,
  validateAllParameters,
  [param('id').isInt({ min: 1 }).withMessage('id debe ser número entero positivo').toInt()],
  handleValidationErrors,
  appointmentsController.cancelAppointment
);

module.exports = router;
