const askChatbot = async (req, res) => {
  const { message } = req.body;

  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "El mensaje no puede estar vacío" });
  }

  try {
    const response = await fetch("http://127.0.0.1:5005/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
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

module.exports = { askChatbot };