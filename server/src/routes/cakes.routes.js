const express = require('express');
const router = express.Router();
const cakesController = require('../controllers/cakes.controller');

router.get('/', cakesController.getAll);
router.get('/:id', cakesController.getById);

module.exports = router;
