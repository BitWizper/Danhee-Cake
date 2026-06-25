const express = require('express');
const router = express.Router();
const { generateOxxoTicket } = require('../controllers/payments.controller');

router.post('/oxxo-ticket', generateOxxoTicket);

module.exports = router;
