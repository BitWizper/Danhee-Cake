const express = require('express');
const { askChatbot } = require('../controllers/chat.controller');

const router = express.Router();

router.post("/", askChatbot);

module.exports = router;