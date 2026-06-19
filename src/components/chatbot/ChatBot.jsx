import { useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaRobot, FaTimes, FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";
import { useAuth } from "../../context/AuthContext";
import "./ChatBot.css";

const WELCOME_MESSAGE = {
  id: "welcome",
  sender: "bot",
  text: "Hola, soy Danhee Assistant. Puedo ayudarte con sabores, tamaños, rellenos, decoración y pedidos personalizados.",
};

function ChatBot() {
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chat, setChat] = useState([WELCOME_MESSAGE]);
  const [loadingState, setLoadingState] = useState({ status: "", message: "" });
  const [isListening, setIsListening] = useState(false);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const lastTranscriptRef = useRef("");
  const autoSubmitRef = useRef(false);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta el reconocimiento de voz. Por favor usa Google Chrome o Microsoft Edge.");
      return;
    }

    try {
      // Limpiar estado anterior al iniciar nueva grabación
      setMessage("");
      lastTranscriptRef.current = "";
      autoSubmitRef.current = false;
      
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "es-MX";

      rec.onstart = () => {
        setIsListening(true);
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
      };

      rec.onresult = (event) => {
        let fullTranscript = "";
        let isFinal = false;
        
        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript;
          if (event.results[i].isFinal) isFinal = true;
        }
        
        if (fullTranscript) {
          lastTranscriptRef.current = fullTranscript;
          setMessage(fullTranscript);
        }

        // Si la transcripción es final, esperar pausa y luego detener + enviar
        if (isFinal) {
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
          autoSubmitRef.current = true;
          silenceTimeoutRef.current = setTimeout(() => {
            if (recognitionRef.current) {
              recognitionRef.current.stop();
            }
          }, 600);
        }
      };

      rec.onerror = (event) => {
        if (event.error === "no-speech") {
          console.warn("No se detectó voz. Por favor, intenta de nuevo.");
        } else if (event.error === "aborted") {
          console.warn("Reconocimiento de voz cancelado.");
        } else if (event.error === "network") {
          console.warn("Error de red en reconocimiento de voz.");
          alert("El reconocimiento de voz requiere conexión a Internet. Por favor verifica tu conexión.");
        } else {
          if (event.error === "not-allowed") {
            alert("Acceso al micrófono denegado. Habilita los permisos de micrófono en tu navegador.");
          } else {
            console.error("Error en reconocimiento de voz:", event.error);
          }
        }
        autoSubmitRef.current = false;
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
        // Auto-enviar si hay transcripción final
        if (autoSubmitRef.current && lastTranscriptRef.current.trim()) {
          autoSubmitRef.current = false;
          // Usar un timeout mínimo para que el state de message se actualice
          setTimeout(() => {
            const fakeEvent = { preventDefault: () => {} };
            // Disparar envío con el valor del ref (no del estado que podría ser stale)
            sendMessageText(lastTranscriptRef.current.trim(), fakeEvent);
          }, 50);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error("Error al iniciar Web Speech:", err);
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      autoSubmitRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      return;
    }

    startListening();
  };

  // Cargar el historial de conversación del usuario autenticado
  const loadConversationHistory = async () => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("user") || "null");
      if (!storedUser?.id) return;

      const response = await fetch(`http://localhost:5005/chat/history?client_id=${storedUser.id}`);

      if (response.ok) {
        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          const historyMessages = data.messages.map((msg, index) => ({
            id: `hist-${index}`,
            sender: msg.role === 'user' ? 'user' : 'bot',
            text: msg.content
          }));
          setChat(historyMessages);
        } else {
          setChat([WELCOME_MESSAGE]);
        }
      } else {
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
      localStorage.removeItem('conversation_id');
      loadConversationHistory();
    } else {
      setChat([WELCOME_MESSAGE]);
      localStorage.removeItem('conversation_id');
    }
    setMessage("");
    setIsSending(false);
    setOpen(false);
  }, [user]);

  // Limpiar recursos de grabación cuando se desmonta el componente
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, open, loadingState]);

  const _doSend = async (trimmedMessage) => {
    const userMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: trimmedMessage,
    };

    setChat((prev) => [...prev, userMessage]);
    setIsSending(true);
    setLoadingState({ status: "thinking", message: "Conectando con el asistente..." });

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

      // Conectarse al endpoint de streaming del Node Server
      const res = await fetch("http://localhost:4000/api/chat/stream", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          message: trimmedMessage,
          conversation_id: conversation_id,
          client_id: storedUser ? storedUser.id : null,
        }),
      });

      if (!res.ok) {
        throw new Error("Error al iniciar el stream de respuesta");
      }

      const botMessageId = (Date.now() + 1).toString();
      // Insertar placeholder para el bot
      setChat((prev) => [
        ...prev,
        {
          id: botMessageId,
          sender: "bot",
          text: "",
        },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullBotResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop(); // Mantener el fragmento incompleto

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine.startsWith("data: ")) continue;

          const jsonStr = cleanLine.slice(6);
          try {
            const data = JSON.parse(jsonStr);

            if (data.type === "conversation_id") {
              localStorage.setItem("conversation_id", data.conversation_id);
            } else if (data.type === "state") {
              setLoadingState({ status: data.status, message: data.message });
            } else if (data.type === "token") {
              setLoadingState({ status: "", message: "" });
              fullBotResponse += data.content;

              setChat((prev) => {
                const updated = [...prev];
                const index = updated.findIndex((msg) => msg.id === botMessageId);
                if (index !== -1) {
                  updated[index] = {
                    ...updated[index],
                    text: fullBotResponse,
                  };
                }
                return updated;
              });
            } else if (data.type === "error") {
              setLoadingState({ status: "", message: "" });
              fullBotResponse = data.content;

              setChat((prev) => {
                const updated = [...prev];
                const index = updated.findIndex((msg) => msg.id === botMessageId);
                if (index !== -1) {
                  updated[index] = {
                    ...updated[index],
                    text: fullBotResponse,
                  };
                }
                return updated;
              });
            }
          } catch (e) {
            console.error("Error al parsear stream token:", e);
          }
        }
      }

    } catch (error) {
      console.error(error);
      setChat((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "bot",
          text: "Tuve un problema al procesar tu mensaje. Vuelve a intentarlo, por favor.",
        },
      ]);
    } finally {
      setIsSending(false);
      setLoadingState({ status: "", message: "" });
    }
  };

  // Wrapper para el formulario (usa el estado message)
  const sendMessage = (event) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSending) return;
    setMessage("");
    _doSend(trimmedMessage);
  };

  // Versión usada por el auto-envío de voz (recibe texto directamente)
  const sendMessageText = (text, event) => {
    if (event) event.preventDefault();
    const trimmedMessage = (text || "").trim();
    if (!trimmedMessage || isSending) return;
    setMessage("");
    _doSend(trimmedMessage);
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

            {chat.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message ${msg.sender}`}
              >
                <span className="chat-message-label">
                  {msg.sender === "user" ? "Tú" : "Danhee"}
                </span>
                {msg.text}
              </div>
            ))}

            {loadingState.status && (
              <div className="chat-loading-state">
                <span className="loading-spinner"></span>
                <span className="loading-text">{loadingState.message}</span>
              </div>
            )}

            <div ref={messagesEndRef} />

          </div>

          <form className="chat-footer" onSubmit={sendMessage}>

            <button
              type="button"
              className={`mic-button ${isListening ? "active" : ""}`}
              onClick={toggleListening}
              title={isListening ? "Detener grabación de voz" : "Grabar voz"}
              disabled={isSending}
            >
              {isListening ? <FaMicrophoneSlash /> : <FaMicrophone />}
            </button>

            <input
              type="text"
              placeholder={isListening ? "Escuchando..." : "Pregunta algo..."}
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