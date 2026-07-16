const express = require('express');
const { askChatbot, getChatHistory } = require('../controllers/chat.controller');

const router = express.Router();

router.post("/", askChatbot);
router.get("/history", getChatHistory);

module.exports = router;