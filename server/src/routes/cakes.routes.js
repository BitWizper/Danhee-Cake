const express = require('express');
const router = express.Router();
const cakesController = require('../controllers/cakes.controller');
const { query, param } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');

// Validación para parámetros de consulta en getAll
const validateCakesQuery = [
  query('category').optional().trim().isLength({ max: 100 }).withMessage('category máximo 100 caracteres'),
  query('baker').optional().trim().isInt().withMessage('baker debe ser un entero'),
  query('featured').optional().isIn(['true', 'false']).withMessage('featured debe ser true o false'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit debe ser entre 1 y 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset debe ser un número positivo'),
];

// Validación para parámetros de ruta
const validateCakeId = [
  param('id').isInt().withMessage('id debe ser un entero'),
];

router.get('/', validateCakesQuery, handleValidationErrors, cakesController.getAll);
router.get('/:id', validateCakeId, handleValidationErrors, cakesController.getById);

module.exports = router;
