import { useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaRobot, FaTimes } from "react-icons/fa";
import { useAuth } from "../../context/AuthContext";
import "./ChatBot.css";

const WELCOME_MESSAGE = {
  sender: "bot",
  text: "Hola, soy Danhee Assistant. Puedo ayudarte con sabores, tamaños, rellenos, decoración y pedidos personalizados.",
};

function ChatBot() {
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chat, setChat] = useState([WELCOME_MESSAGE]);
  const messagesEndRef = useRef(null);

  // Cargar el historial de conversación del usuario autenticado
  const loadConversationHistory = async () => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("user") || "null");
      if (!storedUser?.id) return;

      // Llamar directamente al servidor Python (puerto 5005)
      const response = await fetch(`http://localhost:5005/chat/history?client_id=${storedUser.id}`);

      if (response.ok) {
        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          // Convertir al formato que usa el chat (sender: "user" o "bot")
          const historyMessages = data.messages.map(msg => ({
            sender: msg.role === 'user' ? 'user' : 'bot',
            text: msg.content
          }));
          setChat(historyMessages);
        } else {
          // No hay historial, mostrar mensaje de bienvenida
          setChat([WELCOME_MESSAGE]);
        }
      } else {
        // Error en la respuesta, mantener bienvenida
        setChat([WELCOME_MESSAGE]);
      }
    } catch (error) {
      console.error("Error cargando historial:", error);
      setChat([WELCOME_MESSAGE]);
    }
  };

  // Cuando el usuario cambia (login o logout)
  useEffect(() => {
    if (user) {
      // Usuario autenticado: eliminar conversation_id actual para que el backend recupere el último
      localStorage.removeItem('conversation_id');
      // Cargar el historial de conversaciones
      loadConversationHistory();
    } else {
      // Usuario no autenticado: resetear chat a bienvenida y limpiar ID
      setChat([WELCOME_MESSAGE]);
      localStorage.removeItem('conversation_id');
    }
    setMessage("");
    setIsSending(false);
    setOpen(false);
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, open]);

  const sendMessage = async (event) => {
    event.preventDefault();

    const trimmedMessage = message.trim();

    if (!trimmedMessage || isSending) return;

    const userMessage = {
      sender: "user",
      text: trimmedMessage,
    };

    setChat((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      const token = localStorage.getItem("token");
      const conversation_id = localStorage.getItem("conversation_id");
      const storedUser = JSON.parse(localStorage.getItem("user") || "null");

      const headers = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Enviar al proxy Node.js (puerto 4000) que redirige al servidor Python
      const res = await fetch(
        "http://localhost:4000/api/chat",
        {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            message: trimmedMessage,
            conversation_id: conversation_id,
            client_id: storedUser ? storedUser.id : null,
          }),
        }
      );

      const data = await res.json();
      const rawText = data.response || "";
      const responseText = rawText.replace(/\uFFFD/g, "").trim();

      if (data.conversation_id) {
        localStorage.setItem("conversation_id", data.conversation_id);
      }

      const botMessage = {
        sender: "bot",
        text: responseText || "No pude generar una respuesta ahora mismo. Intenta de nuevo en unos segundos.",
      };

      setChat((prev) => [...prev, botMessage]);

    } catch (error) {
      console.error(error);
      setChat((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "Tuve un problema al procesar tu mensaje. Vuelve a intentarlo, por favor.",
        },
      ]);
    }

    setMessage("");
    setIsSending(false);
  };

  return (
    <>
      <button
        className="chat-toggle"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Cerrar chatbot" : "Abrir chatbot"}
      >
        {open ? <FaTimes /> : <FaRobot />}
      </button>

      {open && (
        <div className="chat-container glass animate-scaleIn">

          <div className="chat-header">
            <div>
              <span className="chat-eyebrow">Asistente virtual</span>
              <strong>Danhee Assistant</strong>
            </div>
            <span className="chat-status">En línea</span>
          </div>

          <div className="chat-body" role="log" aria-live="polite">

            {chat.map((msg, index) => (
              <div
                key={index}
                className={`chat-message ${msg.sender}`}
              >
                <span className="chat-message-label">
                  {msg.sender === "user" ? "Tú" : "Danhee"}
                </span>
                {msg.text}
              </div>
            ))}

            {isSending && (
              <div className="chat-message bot typing">
                <span className="chat-message-label">Danhee</span>
                Escribiendo...
              </div>
            )}

            <div ref={messagesEndRef} />

          </div>

          <form className="chat-footer" onSubmit={sendMessage}>

            <input
              type="text"
              placeholder="Pregunta algo..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSending}
            />

            <button type="submit" disabled={isSending || !message.trim()}>
              <FaPaperPlane />
              Enviar
            </button>

          </form>

        </div>
      )}
    </>
  );
}

export default ChatBot;