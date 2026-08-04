// controllers/chat.controller.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sanitizeString } = require('../middleware/inputValidator');

const SUSPICIOUS_CHAT_PATTERN = /(<script|<\/script|javascript:|on\w+\s*=|data:text\/html|union\s+select|or\s+1\s*=\s*1|sleep\s*\(|benchmark\s*\(|--|\/\*|\*\/|%3c|%3e|&#x|\\x[0-9a-f]{2}|\.\.)/i;

const validateChatText = (value, maxLength = 2000, fieldName = 'mensaje') => {
  if (value === null || value === undefined) {
    return { ok: true, sanitized: '' };
  }

  if (typeof value !== 'string') {
    return { ok: false, reason: `${fieldName} debe ser texto` };
  }

  const sanitized = sanitizeString(value, maxLength);
  if (!sanitized || sanitized.trim() === '') {
    return { ok: false, reason: `${fieldName} no puede estar vacío` };
  }

  if (SUSPICIOUS_CHAT_PATTERN.test(sanitized)) {
    return { ok: false, reason: `${fieldName} contiene contenido sospechoso` };
  }

  return { ok: true, sanitized };
};

const getAuthenticatedUserId = (req) => {
  const authHeader = req.headers['authorization'];
  const cookieToken = req.cookies?.access_token;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (cookieToken) {
    token = cookieToken;
  }

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id || decoded.userId || null;
  } catch (error) {
    return null;
  }
};

const askChatbot = async (req, res) => {
  return res.status(410).json({
    error: "GONE",
    message: "Este endpoint ha sido descontinuado. Use POST /api/chat/stream para el chatbot."
  });
};

const getChatHistory = async (req, res) => {
  const { conversation_id, client_id } = req.query;

  const conversationValidation = validateChatText(conversation_id, 100, 'conversation_id');
  const clientValidation = validateChatText(client_id, 100, 'client_id');

  const sanitizedConversationId = conversationValidation.ok ? conversationValidation.sanitized : '';
  let sanitizedClientId = clientValidation.ok ? clientValidation.sanitized : '';

  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return res.status(401).json({ error: "No autorizado", message: "Token requerido" });
  }

  if (!sanitizedClientId && authenticatedUserId) {
    sanitizedClientId = authenticatedUserId.toString();
    console.log(`[Chat History] Usando client_id del usuario autenticado: ${sanitizedClientId}`);
  }

  if (!sanitizedConversationId && !sanitizedClientId) {
    return res.status(400).json({ error: "Se requiere conversation_id o client_id" });
  }

  if (sanitizedClientId && sanitizedClientId !== authenticatedUserId.toString()) {
    console.log(`[Chat History] Intento de acceso no autorizado: user ${authenticatedUserId} intentando acceder a client_id ${sanitizedClientId}`);
    return res.status(403).json({ error: "No tienes permiso para ver este historial" });
  }

  try {
    const ragUrl = process.env.RAG_SERVICE_URL || 'http://rag-service:5001';
    let response;
    
    if (sanitizedConversationId) {
      response = await fetch(`${ragUrl}/chat/history/${sanitizedConversationId}?client_id=${authenticatedUserId}`, {
        headers: { "X-RAG-Secret": process.env.RAG_SERVICE_SECRET }
      });
    } else {
      response = await fetch(`${ragUrl}/chat/history?client_id=${encodeURIComponent(sanitizedClientId)}`, {
        headers: { "X-RAG-Secret": process.env.RAG_SERVICE_SECRET }
      });
    }

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: "Historial no encontrado" });
      }
      if (response.status === 403) {
        return res.status(403).json({ error: "No tienes permiso para ver este historial" });
      }
      const errText = await response.text();
      console.error("[Node Server] Error del historial RAG:", errText);
      return res.status(500).json({ error: "Error en el servicio RAG" });
    }

    const data = await response.json();
    
    const sanitizedMessages = (data.messages || []).map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || msg.created_at,
      conversation_id: msg.conversation_id
    }));

    return res.json({
      conversation_id: data.conversation_id,
      messages: sanitizedMessages,
      count: sanitizedMessages.length
    });
  } catch (error) {
    console.error("[Node Server] No se pudo conectar con el historial RAG:", error.message);
    return res.status(500).json({
      error: "El asistente de IA se está iniciando. Por favor, intenta de nuevo en unos segundos."
    });
  }
};

const streamChatbot = async (req, res) => {
  // Validar RAG_SERVICE_SECRET no sea el placeholder inseguro
  if (!process.env.RAG_SERVICE_SECRET || process.env.RAG_SERVICE_SECRET === 'change-me-in-production') {
    console.error('[Chat Stream] RAG_SERVICE_SECRET no está configurado o usa placeholder inseguro');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.write(`data: ${JSON.stringify({ type: "error", content: "El servicio de chat no está configurado correctamente" })}\n\n`);
    return res.end();
  }

  const { message, conversation_id } = req.body;
  console.log('[Chat Stream] Message received:', message);
  console.log('[Chat Stream] Conversation ID:', conversation_id);
  
  const messageValidation = validateChatText(message, 5000, 'El mensaje');
  const conversationValidation = validateChatText(conversation_id, 100, 'conversation_id');

  console.log('[Chat Stream] Message validation:', messageValidation);
  console.log('[Chat Stream] Conversation validation:', conversationValidation);

  if (!messageValidation.ok) {
    console.log('[Chat Stream] Message validation failed:', messageValidation.reason);
    return res.status(400).json({ error: messageValidation.reason });
  }

  const sanitizedMessage = messageValidation.sanitized;
  const sanitizedConversationId = conversationValidation.ok ? conversationValidation.sanitized : '';
  
  console.log('[Chat Stream] Sanitized message:', sanitizedMessage);

  let client_id = null;
  let role = null;
  const authHeader = req.headers['authorization'];
  const cookieToken = req.cookies?.access_token;

  // Prioridad: header Authorization > cookie
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (cookieToken) {
    token = cookieToken;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      client_id = decoded.id || decoded.userId || null;
      role = decoded.role || null;
      if (typeof role === 'string') {
        role = role.toLowerCase().trim();
        if (!['cliente', 'repostero'].includes(role)) {
          role = null;
        }
      }
      console.log(`[Chat Stream] Usuario autenticado: ID=${client_id}, Rol=${role}`);
    } catch (error) {
      console.log(`[Chat Stream] Token inválido o expirado, continuando como invitado`);
      client_id = null;
      role = null;
    }
  } else {
    console.log(`[Chat Stream] No hay token, usuario invitado`);
  }

  // Configurar cabeceras de Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'close');
  res.setHeader('X-Accel-Buffering', 'no');

  // Timeout para detectar conexiones colgadas (5 minutos)
  const timeoutMs = 5 * 60 * 1000;
  const timeoutId = setTimeout(() => {
    console.warn('[Node Stream] Timeout alcanzado, cerrando conexión');
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: "error", content: "Tiempo de espera agotado. Por favor intenta de nuevo." })}\n\n`);
      res.end();
    }
  }, timeoutMs);

  try {
    const ragUrl = process.env.RAG_SERVICE_URL || 'http://rag-service:5001';
    const conversationId = sanitizedConversationId || (crypto.randomUUID ? crypto.randomUUID() : `conv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`);
    
    if (!process.env.RAG_SERVICE_URL) {
      console.warn('[Node Stream] RAG_SERVICE_URL no está configurado; usando fallback http://rag-service:5001');
    }
    
    // Llamar al endpoint de stream del RAG service con timeout
    const controller = new AbortController();
    const ragTimeoutId = setTimeout(() => controller.abort(), timeoutMs - 10000); // Abortar 10s antes del timeout general

    const ragRes = await fetch(`${ragUrl}/chat/stream`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-RAG-Secret": process.env.RAG_SERVICE_SECRET
      },
      body: JSON.stringify({ 
        conversation_id: conversationId,
        user_message: sanitizedMessage, 
        user_role: role || 'cliente', 
        user_id: client_id 
      }),
      signal: controller.signal
    });

    clearTimeout(ragTimeoutId);

    if (!ragRes.ok) {
      console.error("[Node Stream] Error del servicio RAG:", ragRes.statusText);
      res.write(`data: ${JSON.stringify({ type: "error", content: "Error en el servicio RAG" })}\n\n`);
      clearTimeout(timeoutId);
      return res.end();
    }

    const reader = ragRes.body.getReader();
    const decoder = new TextDecoder();
    let streamBuffer = "";
    let lastDataTime = Date.now();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Si quedó algo en el buffer al finalizar, lo enviamos
          if (streamBuffer.trim()) {
            res.write(streamBuffer);
          }
          break;
        }

        lastDataTime = Date.now();

        // Decodificar usando { stream: true } para evitar fragmentación de caracteres
        streamBuffer += decoder.decode(value, { stream: true });
        
        // Separamos por bloques de eventos SSE
        const lines = streamBuffer.split("\n\n");
        streamBuffer = lines.pop(); // Guardar fragmento incompleto para el siguiente ciclo

        for (const line of lines) {
          if (line.trim()) {
            res.write(`${line}\n\n`);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Cierre forzado y limpio de la conexión HTTP hacia React
    clearTimeout(timeoutId);
    res.end();

  } catch (error) {
    console.error("[Node Stream] Error conectando con el servicio RAG:", error.message);
    clearTimeout(timeoutId);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: "error", content: "El asistente de IA se está iniciando. Por favor, intenta de nuevo." })}\n\n`);
      res.end();
    }
  }
};

const deleteChatHistory = async (req, res) => {
  const { conversation_id, client_id } = req.body;

  const conversationValidation = validateChatText(conversation_id, 100, 'conversation_id');
  const clientValidation = validateChatText(client_id, 100, 'client_id');

  const sanitizedConversationId = conversationValidation.ok ? conversationValidation.sanitized : '';
  const sanitizedClientId = clientValidation.ok ? clientValidation.sanitized : '';

  if (!sanitizedConversationId && !sanitizedClientId) {
    return res.status(400).json({ error: "Se requiere conversation_id o client_id para eliminar el historial" });
  }

  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return res.status(401).json({ error: "No autorizado", message: "Token requerido" });
  }

  if (sanitizedClientId && sanitizedClientId !== authenticatedUserId.toString()) {
    console.log(`[Chat Delete] Intento de acceso no autorizado: user ${authenticatedUserId} intentando eliminar client_id ${sanitizedClientId}`);
    return res.status(403).json({ error: "No tienes permiso para eliminar este historial" });
  }

  try {
    const ragUrl = process.env.RAG_SERVICE_URL || 'http://rag-service:5001';
    const response = await fetch(`${ragUrl}/chat/${sanitizedConversationId}?client_id=${authenticatedUserId}`, {
      method: "DELETE",
      headers: { 
        "Content-Type": "application/json",
        "X-RAG-Secret": process.env.RAG_SERVICE_SECRET
      },
    });

    if (response.status === 404) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    if (response.status === 403) {
      return res.status(403).json({ error: "No tienes permiso para eliminar este historial" });
    }

    if (!response.ok) {
      console.error("[Chat Delete] Error del servicio RAG:", response.status);
      return res.status(500).json({ error: "Error eliminando historial" });
    }

    const data = await response.json();
    return res.json({
      message: "Historial eliminado exitosamente",
      deleted: data.deleted !== false
    });
  } catch (error) {
    console.error("[Chat Delete] Error al borrar historial:", error.message);
    return res.status(500).json({ error: "No se pudo borrar el historial" });
  }
};

module.exports = { askChatbot, streamChatbot, getChatHistory, deleteChatHistory };