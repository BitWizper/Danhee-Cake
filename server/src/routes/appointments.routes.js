// routes/appointments.routes.js
const express = require('express');
const router = express.Router();
const appointmentsController = require('../controllers/appointments.controller');
const { authMiddleware } = require('../middleware/auth');

// ============================================
// RUTAS PÚBLICAS (sin autenticación)
// ============================================

// Ruta interna para citas agendadas por el chatbot IA (solo localhost, sin JWT)
// El client_id viene decodificado del JWT por chat.controller y enviado por Python RAG
router.post('/internal', appointmentsController.createInternal);

// Ruta para solicitudes de invitados (no autenticados)
router.post('/guest', appointmentsController.createGuest);

// Ruta pública para verificar disponibilidad de un repostero
router.get('/baker/:baker_id/date/:date', appointmentsController.getBakerAvailability);

// ============================================
// RUTAS PROTEGIDAS (requieren JWT)
// ============================================
router.use(authMiddleware);

// Crear nueva cita (usuario autenticado)
router.post('/', appointmentsController.create);

// Obtener citas del usuario autenticado
router.get('/my-appointments', appointmentsController.getUserAppointments);

module.exports = router;
