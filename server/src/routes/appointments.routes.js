const express = require('express');
const router = express.Router();
const appointmentsController = require('../controllers/appointments.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas de citas requieren login
router.use(authMiddleware);

router.post('/', appointmentsController.create);
router.get('/my-appointments', appointmentsController.getUserAppointments);

module.exports = router;
