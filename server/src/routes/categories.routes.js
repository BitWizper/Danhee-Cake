const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categories.controller');
const { query } = require('express-validator');
const handleValidationErrors = require('../middleware/validationHandler');

// Validación para parámetros de consulta
const validateQueryParams = [
  query('active').optional().isIn(['true', 'false', '0', '1']).withMessage('active debe ser true o false'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit debe ser entre 1 y 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset debe ser un número positivo'),
];

router.get('/', validateQueryParams, handleValidationErrors, categoriesController.getAll);

module.exports = router;
