// routes/appointments.routes.js
const express = require('express');
const router = express.Router();
const appointmentsController = require('../controllers/appointments.controller');
const { authMiddleware } = require('../middleware/auth');
const { body, param } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');

// ============================================
// RUTAS PÚBLICAS (sin autenticación)
// ============================================

// Ruta interna para citas agendadas por el chatbot IA (solo localhost, sin JWT)
// El client_id viene decodificado del JWT por chat.controller y enviado por Python RAG
router.post('/internal',
  [
    body('client_id').optional().isInt().withMessage('client_id debe ser un entero'),
    body('baker_id').isInt().withMessage('baker_id debe ser un entero'),
    body('date').isISO8601().withMessage('date debe ser una fecha válida'),
    body('time_slot').notEmpty().withMessage('time_slot es requerido'),
    body('notes').optional().isLength({ max: 500 }).withMessage('notes máximo 500 caracteres')
  ],
  handleValidationErrors,
  appointmentsController.createInternal
);

// Ruta para solicitudes de invitados (no autenticados)
router.post('/guest',
  [
    body('baker_id').isInt().withMessage('baker_id debe ser un entero'),
    body('date').isISO8601().withMessage('date debe ser una fecha válida'),
    body('time_slot').notEmpty().withMessage('time_slot es requerido'),
    body('notes').optional().isLength({ max: 500 }).withMessage('notes máximo 500 caracteres')
  ],
  handleValidationErrors,
  appointmentsController.createGuest
);

// Ruta pública para verificar disponibilidad de un repostero
router.get('/baker/:baker_id/date/:date', appointmentsController.getBakerAvailability);

// ============================================
// RUTAS PROTEGIDAS (requieren JWT)
// ============================================
router.use(authMiddleware);

// Crear nueva cita (usuario autenticado)
router.post('/',
  [
    body('baker_id').isInt().withMessage('baker_id debe ser un entero'),
    body('date').isISO8601().withMessage('date debe ser una fecha válida'),
    body('time_slot').notEmpty().withMessage('time_slot es requerido'),
    body('notes').optional().isLength({ max: 500 }).withMessage('notes máximo 500 caracteres')
  ],
  handleValidationErrors,
  appointmentsController.create
);

// Obtener citas del usuario autenticado
router.get('/my-appointments', appointmentsController.getUserAppointments);

// Cancelar una cita (solo el dueño)
router.delete('/:id',
  [param('id').isInt().withMessage('id debe ser un entero')],
  handleValidationErrors,
  appointmentsController.cancelAppointment
);

module.exports = router;
