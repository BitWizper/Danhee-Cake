// controllers/chat.controller.js
const jwt = require('jsonwebtoken');
const { sanitizeString } = require('../middleware/inputValidator');

const SUSPICIOUS_CHAT_PATTERN = /(<script|<\/script|javascript:|on\w+\s*=|data:text\/html|union\s+select|or\s+1\s*=\s*1|sleep\s*\(|benchmark\s*\(|--|\/\*|\*\/|%3c|%3e|&#x|\\x[0-9a-f]{2}|\.\.)/i;

const validateChatText = (value, maxLength = 5000, fieldName = 'mensaje') => {
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

const askChatbot = async (req, res) => {
  const { message } = req.body;
  const validation = validateChatText(message, 5000, 'El mensaje');

  if (!validation.ok) {
    return res.status(400).json({ error: validation.reason });
  }

  const sanitizedMessage = validation.sanitized;

  console.log(`[Chat DEBUG] Recibida solicitud - message: ${sanitizedMessage}`);

  // ── Detectar si el usuario está logueado ──────────────────────────────────
  // Si hay un JWT válido en el header Authorization, extraemos el client_id
  // para que el chatbot pueda agendar citas reales. Si no, client_id = null.
  let client_id = null;
  let role = null;
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      client_id = decoded.id || decoded.userId || null;
      role = decoded.role || null;
      if (typeof role === 'string') {
        role = role.toLowerCase().trim();
        if (!['cliente', 'repostero'].includes(role)) {
          role = null;
        }
      }
      console.log(`[Chat] Usuario autenticado: ID=${client_id}, Email=${decoded.email}, Rol=${role}`);
    } catch (error) {
      // Token ausente, expirado o inválido → usuario no autenticado
      console.log(`[Chat] Token inválido o expirado, continuando como invitado`);
      client_id = null;
      role = null;
    }
  } else {
    console.log(`[Chat] No hay token, usuario invitado`);
  }

  try {
    const ragUrl = process.env.RAG_SERVICE_URL;
    const conversationId = req.body.conversation_id || `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    console.log(`[Chat DEBUG] Conectando a RAG service: ${ragUrl}/chat`);
    const response = await fetch(`${ragUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        conversation_id: conversationId,
        user_message: sanitizedMessage, 
        user_role: role || 'cliente', 
        user_id: client_id 
      }),
    });

    console.log(`[Chat DEBUG] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errText = await response.text();
      console.error("[Node Server] Error del servicio RAG:", errText);
      return res.status(500).json({ error: "Error en el servicio RAG" });
    }

    const data = await response.json();
    return res.json({
      response: (data.response || "").trim(),
      conversation_id: conversationId,
      tool_calls: data.tool_calls,
      was_blocked: data.was_blocked
    });
  } catch (error) {
    console.error("[Node Server] No se pudo conectar con el servicio RAG:", error.message);
    return res.status(500).json({
      error: "El asistente de IA se está iniciando. Por favor, intenta de nuevo en unos segundos."
    });
  }
};

const getChatHistory = async (req, res) => {
  const { conversation_id, client_id } = req.query;

  const conversationValidation = validateChatText(conversation_id, 100, 'conversation_id');
  const clientValidation = validateChatText(client_id, 100, 'client_id');

  const sanitizedConversationId = conversationValidation.ok ? conversationValidation.sanitized : '';
  const sanitizedClientId = clientValidation.ok ? clientValidation.sanitized : '';

  if (!sanitizedConversationId && !sanitizedClientId) {
    return res.status(400).json({ error: "Se requiere conversation_id o client_id" });
  }

  try {
    const ragUrl = process.env.RAG_SERVICE_URL;
    const response = await fetch(`${ragUrl}/chat/history/${sanitizedConversationId}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Node Server] Error del historial RAG:", errText);
      return res.status(response.status).json({ error: "Error en el servicio RAG" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("[Node Server] No se pudo conectar con el historial RAG:", error.message);
    return res.status(500).json({
      error: "El asistente de IA se está iniciando. Por favor, intenta de nuevo en unos segundos."
    });
  }
};

const streamChatbot = async (req, res) => {
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

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      client_id = decoded.id || decoded.userId || null;
      role = decoded.role || null;
      if (typeof role === 'string') {
        role = role.toLowerCase().trim();
        if (!['cliente', 'repostero'].includes(role)) {
          role = null;
        }
      }
    } catch (error) {
      console.log(`[Chat Stream] Token inválido o expirado, continuando como invitado`);
      client_id = null;
      role = null;
    }
  }

  // Configurar cabeceras de Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'close');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const ragUrl = process.env.RAG_SERVICE_URL;
    const conversationId = sanitizedConversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // TEMPORALMENTE: Si no hay RAG service, responder con mensaje de error amigable
    if (!ragUrl) {
      console.warn("[Node Stream] RAG_SERVICE_URL no configurado, respondiendo con mensaje de servicio no disponible");
      res.write(`data: ${JSON.stringify({ type: "error", content: "El servicio de chat no está disponible en este momento. Por favor intenta más tarde." })}\n\n`);
      return res.end();
    }
    
    // Llamar al endpoint de stream del RAG service
    const ragRes = await fetch(`${ragUrl}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        conversation_id: conversationId,
        user_message: sanitizedMessage, 
        user_role: role || 'cliente', 
        user_id: client_id 
      }),
    });

    if (!ragRes.ok) {
      console.error("[Node Stream] Error del servicio RAG:", ragRes.statusText);
      res.write(`data: ${JSON.stringify({ type: "error", content: "Error en el servicio RAG" })}\n\n`);
      return res.end();
    }

    const reader = ragRes.body.getReader();
    const decoder = new TextDecoder();
    let streamBuffer = "";

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
    res.end();

  } catch (error) {
    console.error("[Node Stream] Error conectando con el servicio RAG:", error.message);
    res.write(`data: ${JSON.stringify({ type: "error", content: "El asistente de IA se está iniciando. Por favor, intenta de nuevo." })}\n\n`);
    res.end();
  }
};

const deleteChatHistory = async (req, res) => {
  const { conversation_id, client_id } = req.body;

  const conversationValidation = validateChatText(conversation_id, 100, 'conversation_id');
  const clientValidation = validateChatText(client_id, 100, 'client_id');

  const sanitizedConversationId = conversationValidation.ok ? conversationValidation.sanitized : '';
  const sanitizedClientId = clientValidation.ok ? clientValidation.sanitized : '';

  try {
    const ragUrl = process.env.RAG_SERVICE_URL;
    const response = await fetch(`${ragUrl}/chat/${sanitizedConversationId}?client_id=${sanitizedClientId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      return res.status(500).json({ error: "Error eliminando historial RAG" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("[Node Server] Error al borrar historial:", error.message);
    return res.status(500).json({ error: "No se pudo borrar el historial" });
  }
};

module.exports = { askChatbot, streamChatbot, getChatHistory, deleteChatHistory };