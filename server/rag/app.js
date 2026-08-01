/**
 * app.js — Servidor HTTP principal del microservicio RAG de Danhee Cake.
 * Versión JavaScript/Node.js equivalente a app.py
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { ChromaClient } = require('chromadb');
const TaskRouter = require('./agents/router');
const db = require('./db-config');

const app = express();
const PORT = process.env.RAG_PORT || 5001;

app.use(cors());
app.use(express.json());

// Middleware de autenticación para el RAG service
const authenticateRAGRequest = (req, res, next) => {
    // El RAG service solo acepta solicitudes del Node server principal
    // Verificamos un header secreto compartido
    const ragSecret = req.headers['x-rag-secret'];
    
    if (ragSecret !== process.env.RAG_SERVICE_SECRET) {
        console.warn('[RAG Auth] Unauthorized access attempt - missing or invalid secret');
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    next();
};

let chromaClient = null;
let taskRouter = null;

async function initializeClients() {
    try {
        try {
            chromaClient = new ChromaClient({
                path: process.env.CHROMA_HOST || 'http://localhost:8000'
            });
            console.error('[app] ✅ Cliente ChromaDB inicializado');
        } catch (e) {
            console.error(`[app] ⚠️ ChromaDB no disponible: ${e.message}`);
            console.error('[app] Continuando sin ChromaDB (RAG deshabilitado)');
        }
        
        taskRouter = new TaskRouter(chromaClient);
        console.error('[app] ✅ TaskRouter inicializado');
        
    } catch (e) {
        console.error(`[app] ❌ Error inicializando clientes: ${e.message}`);
        process.exit(1);
    }
}

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'danhee-cake-rag-js', timestamp: new Date().toISOString() });
});

// Aplicar autenticación a todos los endpoints de chat
app.post('/chat', authenticateRAGRequest, async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { conversation_id, user_message, user_role, user_id } = req.body;
        console.log(`[RAG] POST /chat - conversation_id: ${conversation_id}, user_message: "${user_message}", user_role: ${user_role}, user_id: ${user_id}`);
        
        if (!conversation_id || !user_message) {
            return res.status(400).json({
                error: 'Missing required fields: conversation_id and user_message are required'
            });
        }
        
        if (!taskRouter) {
            return res.status(503).json({ error: 'Service not ready' });
        }
        
        const result = await taskRouter.route(
            conversation_id,
            user_message,
            user_role || 'cliente',
            user_id || null
        );
        
        const latency = Date.now() - startTime;
        
        res.json({
            response: result.response,
            tool_calls: result.toolCalls,
            was_blocked: result.wasBlocked,
            latency_ms: latency,
            conversation_id
        });
        
    } catch (e) {
        console.error(`[app] Error en /chat: ${e.message}`);
        res.status(500).json({ error: 'Internal server error', message: e.message });
    }
});

app.get('/chat/history/:conversationId', authenticateRAGRequest, async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        const messages = await db.getChatMessages(conversationId);
        
        res.json({
            conversation_id: conversationId,
            messages,
            count: messages.length
        });
        
    } catch (e) {
        console.error(`[app] Error en /chat/history: ${e.message}`);
        res.status(500).json({ error: 'Internal server error', message: e.message });
    }
});

app.get('/chat/history', authenticateRAGRequest, async (req, res) => {
    try {
        const { client_id } = req.query;
        
        if (!client_id) {
            return res.status(400).json({ error: 'client_id parameter is required' });
        }
        
        const conversations = await db.getConversationsByClientId(client_id);
        
        // Get messages for the most recent conversation
        let messages = [];
        let conversation_id = null;
        
        if (conversations.length > 0) {
            conversation_id = conversations[0].conversation_id;
            messages = await db.getChatMessages(conversation_id);
        }
        
        res.json({
            conversation_id: conversation_id,
            messages,
            count: messages.length,
            total_conversations: conversations.length
        });
        
    } catch (e) {
        console.error(`[app] Error en /chat/history (by client_id): ${e.message}`);
        res.status(500).json({ error: 'Internal server error', message: e.message });
    }
});

app.delete('/chat/:conversationId', authenticateRAGRequest, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { client_id } = req.query;
        
        const success = await db.deleteChatConversation(conversationId, client_id);
        
        if (success) {
            res.json({ message: 'Conversation deleted successfully' });
        } else {
            res.status(404).json({ error: 'Conversation not found' });
        }
        
    } catch (e) {
        console.error(`[app] Error en DELETE /chat: ${e.message}`);
        res.status(500).json({ error: 'Internal server error', message: e.message });
    }
});

app.get('/chat/stream', authenticateRAGRequest, async (req, res) => {
    const { conversation_id, user_message, user_role, user_id } = req.query;
    
    if (!conversation_id || !user_message) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    try {
        if (!taskRouter) {
            res.write(`data: ${JSON.stringify({ error: 'Service not ready' })}\n\n`);
            res.end();
            return;
        }
        
        const result = await taskRouter.routeStreaming(
            conversation_id,
            user_message,
            user_role || 'cliente',
            user_id || null
        );
        
        res.write(`data: ${JSON.stringify({ response: result.response, was_blocked: result.wasBlocked })}\n\n`);
        res.end();
        
    } catch (e) {
        console.error(`[app] Error en /chat/stream: ${e.message}`);
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
    }
});

app.post('/chat/stream', authenticateRAGRequest, async (req, res) => {
    const { conversation_id, user_message, user_role, user_id } = req.body;
    
    console.log(`[RAG] POST /chat/stream - conversation_id: ${conversation_id}, user_message: "${user_message}", user_role: ${user_role}, user_id: ${user_id}`);
    
    console.error('[app] /chat/stream request body:', {
        conversation_id,
        user_message: user_message ? user_message.slice(0, 200) : user_message,
        user_role,
        user_id
    });
    
    if (!conversation_id || !user_message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    try {
        if (!taskRouter) {
            res.write(`data: ${JSON.stringify({ error: 'Service not ready' })}\n\n`);
            res.end();
            return;
        }
        
        const result = await taskRouter.routeStreaming(
            conversation_id,
            user_message,
            user_role || 'cliente',
            user_id || null
        );

        console.error('[app] /chat/stream result:', {
            responseSnippet: result.response ? result.response.slice(0, 200) : null,
            wasBlocked: result.wasBlocked
        });
        
        res.write(`data: ${JSON.stringify({ response: result.response, was_blocked: result.wasBlocked })}\n\n`);
        res.end();
        
    } catch (e) {
        console.error(`[app] Error en POST /chat/stream: ${e.stack || e.message}`);
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
    }
});

// Endpoint de observability eliminado por seguridad - no tenía funcionalidad real
// app.get('/observability/logs/:sessionId', async (req, res) => {

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
    console.error(`[app] Error no manejado: ${err.message}`);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

async function startServer() {
    await initializeClients();
    
    app.listen(PORT, () => {
        console.error(`[app] 🚀 Servidor RAG de Danhee Cake (Node.js) escuchando en puerto ${PORT}`);
        console.error(`[app] 📡 Health check: http://localhost:${PORT}/health`);
        console.error(`[app] 💬 Chat endpoint: http://localhost:${PORT}/chat`);
    });
}

if (require.main === module) {
    startServer().catch(e => {
        console.error(`[app] Error iniciando servidor: ${e.message}`);
        process.exit(1);
    });
}

module.exports = { app, initializeClients, startServer };
