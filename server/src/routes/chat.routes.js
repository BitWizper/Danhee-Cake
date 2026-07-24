const express = require('express');
const { askChatbot, getChatHistory, deleteChatHistory } = require('../controllers/chat.controller');

const router = express.Router();

router.post("/", askChatbot);
router.get("/history", getChatHistory);
router.delete("/history", deleteChatHistory);

module.exports = router;