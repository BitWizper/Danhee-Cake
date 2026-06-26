// controllers/chat.controller.js
const jwt = require('jsonwebtoken');

const askChatbot = async (req, res) => {
  const { message } = req.body;

  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "El mensaje no puede estar vacío" });
  }

  // ── Detectar si el usuario está logueado ──────────────────────────────────
  // Si hay un JWT válido en el header Authorization, extraemos el client_id
  // para que el chatbot pueda agendar citas reales. Si no, client_id = null.
  let client_id = null;
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      client_id = decoded.id || decoded.userId || null;
      console.log(`[Chat] Usuario autenticado: ID=${client_id}, Email=${decoded.email}`);
    } catch (error) {
      // Token ausente, expirado o inválido → usuario no autenticado
      console.log(`[Chat] Token inválido o expirado, continuando como invitado`);
      client_id = null;
    }
  } else {
    console.log(`[Chat] No hay token, usuario invitado`);
  }

  try {
    const response = await fetch("http://127.0.0.1:5005/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, client_id }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Node Server] Error del servicio RAG Python:", errText);
      return res.status(500).json({ error: "Error en el servicio RAG" });
    }

    const data = await response.json();
    return res.json({
      response: (data.response || "").trim(),
    });
  } catch (error) {
    console.error("[Node Server] No se pudo conectar con el servicio RAG Python:", error.message);
    return res.status(500).json({
      error: "El asistente de IA se está iniciando. Por favor, intenta de nuevo en unos segundos."
    });
  }
};

const streamChatbot = async (req, res) => {
  const { message, conversation_id } = req.body;

  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "El mensaje no puede estar vacío" });
  }

  let client_id = null;
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      client_id = decoded.id || decoded.userId || null;
    } catch (error) {
      console.log(`[Chat Stream] Token inválido o expirado, continuando como invitado`);
      client_id = null;
    }
  }

  // Configurar cabeceras de Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // Llamar al endpoint de stream del backend en Python
    const pythonRes = await fetch("http://127.0.0.1:5005/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, client_id, conversation_id }),
    });

    if (!pythonRes.ok) {
      console.error("[Node Stream] Error del servicio RAG Python:", pythonRes.statusText);
      res.write(`data: ${JSON.stringify({ type: "error", content: "Error en el servicio RAG" })}\n\n`);
      return res.end();
    }

    const reader = pythonRes.body.getReader();
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
      reader.releaseLock(); // Liberar el lector de Python pase lo que pase
    }

    // Cierre forzado y limpio de la conexión HTTP hacia React
    res.end();

  } catch (error) {
    console.error("[Node Stream] Error conectando con el servicio RAG Python:", error.message);
    res.write(`data: ${JSON.stringify({ type: "error", content: "El asistente de IA se está iniciando. Por favor, intenta de nuevo." })}\n\n`);
    res.end();
  }
};

module.exports = { askChatbot, streamChatbot };