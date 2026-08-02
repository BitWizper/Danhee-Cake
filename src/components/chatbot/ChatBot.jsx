import { useEffect, useRef, useState, useCallback } from "react";
import { FaPaperPlane, FaRobot, FaTimes, FaMicrophone, FaMicrophoneSlash, FaEllipsisV, FaShieldAlt } from "react-icons/fa";
import { useAuth } from "../../context/AuthContext";
import { getApiUrl } from "../../config/api";
import {
  CHAT_SECURITY_CONFIG,
  validateMessage,
  sanitizeMessage,
  sanitizeDisplayText,
  isSpamMessage,
  isValidConversationId,
  isValidSSEEvent,
  getChatRateLimitStatus,
  checkAndRecordChatRateLimit,
  syncChatServerRateLimit,
  formatBlockTime,
  detectDOMXSS,
  detectAdvancedSQLi,
  detectNoSQLi,
  hasEncodedPayload,
  sanitizeMessageAdvanced,
} from "../../utils/chatSecurity";
import "./ChatBot.css";

const WELCOME_MESSAGE = {
  id: "welcome",
  sender: "bot",
  text: "Hola, soy Danhee Assistant. Puedo ayudarte con sabores, tamaños, rellenos, decoración y pedidos personalizados.",
};

const BAKER_WELCOME_MESSAGE = {
  id: "welcome",
  sender: "bot",
  text: "Hola, soy el asistente de repostería de Danhee Cake. Te puedo ayudar a listar, agregar, modificar o eliminar pasteles en tu catálogo.",
};

function ChatBot() {
  const { user, token } = useAuth();

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chat, setChat] = useState([WELCOME_MESSAGE]);
  const [loadingState, setLoadingState] = useState({ status: "", message: "" });
  const [isListening, setIsListening] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [validationError, setValidationError] = useState("");
  const [rateLimitStatus, setRateLimitStatus] = useState({
    remaining: CHAT_SECURITY_CONFIG.rateLimit.maxMessages,
    total: CHAT_SECURITY_CONFIG.rateLimit.maxMessages,
    blocked: false,
    blockedUntil: 0,
  });
  const [blockCountdown, setBlockCountdown] = useState(0);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const lastTranscriptRef = useRef("");
  const autoSubmitRef = useRef(false);
  const menuRef = useRef(null);
  const chatBodyRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const refreshRateLimitStatus = useCallback(() => {
    const status = getChatRateLimitStatus();
    setRateLimitStatus(status);
    return status;
  }, []);

  const startBlockCountdown = useCallback((blockedUntil) => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
      setBlockCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        setValidationError("");
        refreshRateLimitStatus();
      }
    };

    tick();
    countdownIntervalRef.current = setInterval(tick, 1000);
  }, [refreshRateLimitStatus]);

  const showValidationError = useCallback((msg, persist = false) => {
    setValidationError(msg);
    if (!persist) {
      setTimeout(() => setValidationError(""), 3500);
    }
  }, []);

  const getWelcomeMessage = () => {
    return user?.role === "repostero" ? BAKER_WELCOME_MESSAGE : WELCOME_MESSAGE;
  };

  const startNewChat = () => {
    if (isSending) return;
    const shouldReset = window.confirm(
      "¿Quieres iniciar un nuevo chat? Tu historial quedara guardado y podras verlo cuando quieras."
    );
    if (!shouldReset) return;
    if (isListening && recognitionRef.current) {
      autoSubmitRef.current = false;
      recognitionRef.current.stop();
    }
    localStorage.removeItem("conversation_id");
    setMessage("");
    setLoadingState({ status: "", message: "" });
    setChat([getWelcomeMessage()]);
    setMenuOpen(false);
  };

  const deleteCurrentChat = async () => {
    if (isSending) return;
    const shouldDelete = window.confirm(
      "¿Estás seguro de que deseas borrar este chat? Se eliminará todo el historial de la conversación actual y se reiniciará desde 0."
    );
    if (!shouldDelete) return;
    if (isListening && recognitionRef.current) {
      autoSubmitRef.current = false;
      recognitionRef.current.stop();
    }

    const conversation_id = localStorage.getItem("conversation_id");
    const clientId = user?.id != null ? user.id : null;

    if (conversation_id && !isValidConversationId(conversation_id)) {
      localStorage.removeItem("conversation_id");
    }

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      await fetch(getApiUrl("/api/chat/history"), {
        method: "DELETE",
        headers,
        credentials: 'include', // Importante para enviar cookies httpOnly
        body: JSON.stringify({
          conversation_id: isValidConversationId(conversation_id) ? conversation_id : null,
          client_id: clientId,
        }),
      });
    } catch (err) {
      console.error("Error al borrar el chat en el servidor:", err);
    }

    localStorage.removeItem("conversation_id");
    setMessage("");
    setLoadingState({ status: "", message: "" });
    setChat([getWelcomeMessage()]);
    setMenuOpen(false);
  };

  const startListening = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta el reconocimiento de voz. Por favor usa Google Chrome o Microsoft Edge.");
      return;
    }

    try {
      setMessage("");
      lastTranscriptRef.current = "";
      autoSubmitRef.current = false;

      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "es-MX";

      rec.onstart = () => {
        setIsListening(true);
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
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
        if (isFinal) {
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
          autoSubmitRef.current = true;
          silenceTimeoutRef.current = setTimeout(() => {
            if (recognitionRef.current) recognitionRef.current.stop();
          }, 600);
        }
      };

      rec.onerror = (event) => {
        if (event.error === "no-speech") {
          console.warn("No se detectó voz.");
        } else if (event.error === "aborted") {
          console.warn("Reconocimiento cancelado.");
        } else if (event.error === "network") {
          alert("El reconocimiento de voz requiere conexión a Internet.");
        } else if (event.error === "not-allowed") {
          alert("Acceso al micrófono denegado. Habilita los permisos en tu navegador.");
        } else {
          console.error("Error en reconocimiento de voz:", event.error);
        }
        autoSubmitRef.current = false;
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
        if (autoSubmitRef.current && lastTranscriptRef.current.trim()) {
          autoSubmitRef.current = false;
          sendMessageText(lastTranscriptRef.current.trim(), { preventDefault: () => {} });
        }
        recognitionRef.current = null;
        lastTranscriptRef.current = "";
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      };

      recognitionRef.current = rec;
      rec.start();
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    } catch (err) {
      console.error("Error al iniciar Web Speech:", err);
      if (err.name === "NotAllowedError" || err.message?.includes("permission")) {
        alert("Permiso de micrófono denegado.");
      } else {
        alert("Error al iniciar el reconocimiento de voz: " + err.message);
      }
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      autoSubmitRef.current = false;
      if (recognitionRef.current) recognitionRef.current.stop();
      recognitionRef.current = null;
      lastTranscriptRef.current = "";
      setIsListening(false);
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      return;
    }
    startListening();
  };

  const loadConversationHistory = async () => {
    try {
      if (!user?.id) return;

      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(
        getApiUrl(`/api/chat/history?client_id=${encodeURIComponent(user.id)}`),
        { 
          headers,
          credentials: 'include' // Importante para enviar cookies httpOnly
        }
      );
      const welcomeMsg = user?.role === "repostero" ? BAKER_WELCOME_MESSAGE : WELCOME_MESSAGE;

      // Manejar 401 - token expirado
      if (response.status === 401) {
        console.warn("[Chat] Token expirado (401), limpiando sesión");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setChat([welcomeMsg]);
        return;
      }

      if (response.ok) {
        const data = await response.json();
      if (data?.error) {
        throw new Error(data.error);
      }
        if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          const historyMessages = data.messages.map((msg, index) => {
            // Validación de seguridad en historial
            if (typeof msg.role !== 'string' || typeof msg.content !== 'string') {
              console.warn("[Security] Mensaje del historial con formato inválido");
              return null;
            }
            return {
              id: `hist-${index}`,
              sender: msg.role === "user" ? "user" : "bot",
              text: sanitizeMessageAdvanced(msg.content),
            };
          }).filter(Boolean);
          
          setChat(historyMessages.length > 0 ? historyMessages : [welcomeMsg]);
        } else {
          setChat([welcomeMsg]);
        }
      } else {
        setChat([welcomeMsg]);
      }
    } catch (error) {
      console.error("Error cargando historial:", error);
      const welcomeMsg = user?.role === "repostero" ? BAKER_WELCOME_MESSAGE : WELCOME_MESSAGE;
      setChat([welcomeMsg]);
    }
  };

  useEffect(() => {
    const initChat = async () => {
      const welcomeMsg = getWelcomeMessage();
      if (user) {
        localStorage.removeItem("conversation_id");
        await loadConversationHistory();
      } else {
        setChat([welcomeMsg]);
        localStorage.removeItem("conversation_id");
      }
      setMessage("");
      setIsSending(false);
      setOpen(false);
      setMenuOpen(false);
    };
    
    initChat();
  }, [user]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        refreshRateLimitStatus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open, refreshRateLimitStatus]);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutsideMenu = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutsideMenu);
    return () => document.removeEventListener("mousedown", handleClickOutsideMenu);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [open]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, loadingState, open]);

  const _doSend = async (trimmedMessage) => {
    const safePreview = sanitizeMessageAdvanced(trimmedMessage);
    const userMessage = { id: Date.now().toString(), sender: "user", text: safePreview };
    setChat((prev) => [...prev, userMessage]);
    setIsSending(true);
    setLoadingState({ status: "thinking", message: "Conectando con el asistente..." });

    try {
      const rawConvId = localStorage.getItem("conversation_id");
      const conversation_id = isValidConversationId(rawConvId) ? rawConvId : null;

      if (rawConvId && !isValidConversationId(rawConvId)) {
        console.warn("[Security] conversation_id inválido, reseteando.");
        localStorage.removeItem("conversation_id");
      }

      const clientId = user?.id != null ? user.id : null;

      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const fetchUrl = getApiUrl("/api/chat/stream");
      console.log("[ChatBot] Enviando stream a:", fetchUrl, "client_id:", clientId, "role:", user?.role);
      const res = await fetch(fetchUrl, {
        method: "POST",
        headers,
        credentials: 'include', // Importante para enviar cookies httpOnly
        body: JSON.stringify({
          message: trimmedMessage,
          conversation_id,
          client_id: clientId,
          role: user?.role || null,
          client_datetime: new Date().toISOString(),
        }),
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const resetHeader = res.headers.get("RateLimit-Reset");
        let retrySec = retryAfter ? parseInt(retryAfter, 10) : null;
        if (!retrySec && resetHeader) {
          const resetTime = parseInt(resetHeader, 10);
          if (!Number.isNaN(resetTime)) {
            retrySec = Math.max(1, resetTime - Math.floor(Date.now() / 1000));
          }
        }
        syncChatServerRateLimit(retrySec);
        const status = getChatRateLimitStatus();
        startBlockCountdown(status.blockedUntil);
        showValidationError(
          `⏳ Demasiados mensajes. Espera ${formatBlockTime(status.blockedUntil - Date.now())} para continuar.`,
          true
        );
        setChat((prev) => prev.filter((m) => m.id !== userMessage.id));
        setIsSending(false);
        setLoadingState({ status: "", message: "" });
        refreshRateLimitStatus();
        return;
      }

      if (res.status === 403) {
        showValidationError("Tu mensaje fue bloqueado por seguridad.");
        setChat((prev) => prev.filter((m) => m.id !== userMessage.id));
        setIsSending(false);
        setLoadingState({ status: "", message: "" });
        return;
      }

      if (!res.ok) {
        throw new Error(`Error al iniciar el stream: ${res.status}`);
      }

      const botMessageId = (Date.now() + 1).toString();
      setChat((prev) => [...prev, { id: botMessageId, sender: "bot", text: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullBotResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine.startsWith("data: ")) continue;

          const jsonStr = cleanLine.slice(6);
          try {
            const data = JSON.parse(jsonStr);

            if (!isValidSSEEvent(data)) {
              console.warn("[Security] Evento SSE ignorado:", data?.type);
              continue;
            }

            // Validación adicional de contenido en SSE
            if (data.type === "token" && data.content) {
              // Detectar XSS en respuesta del servidor
              if (detectDOMXSS(data.content)) {
                console.error("[Security] XSS detectado en respuesta del servidor");
                continue;
              }
            }

            if (data.type === "conversation_id") {
              if (isValidConversationId(data.conversation_id)) {
                localStorage.setItem("conversation_id", data.conversation_id);
              }
            } else if (data.type === "state") {
              setLoadingState({
                status: data.status,
                message: sanitizeMessageAdvanced(data.message),
              });
            } else if (data.type === "token") {
              setLoadingState({ status: "", message: "" });
              fullBotResponse += data.content;
              setChat((prev) => {
                const updated = [...prev];
                const index = updated.findIndex((msg) => msg.id === botMessageId);
                if (index !== -1) {
                  updated[index] = {
                    ...updated[index],
                    text: sanitizeMessageAdvanced(fullBotResponse),
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
                    text: sanitizeMessageAdvanced(fullBotResponse),
                  };
                }
                return updated;
              });
            } else if (typeof data.response === "string" || typeof data.content === "string") {
              const responseText = typeof data.response === "string" ? data.response : data.content;
              setLoadingState({ status: "", message: "" });
              fullBotResponse += responseText;
              setChat((prev) => {
                const updated = [...prev];
                const index = updated.findIndex((msg) => msg.id === botMessageId);
                if (index !== -1) {
                  updated[index] = {
                    ...updated[index],
                    text: sanitizeMessageAdvanced(fullBotResponse),
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

      if (user?.role === "repostero") {
        window.dispatchEvent(new CustomEvent("baker-catalog-updated"));
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
      refreshRateLimitStatus();
    }
  };

  const _handleSend = (rawText) => {
    const trimmedMessage = (rawText || "").trim();

    // Validaciones de seguridad previas
    if (detectAdvancedSQLi(trimmedMessage)) {
      showValidationError("⚠️ Patrón sospechoso detectado (SQLi)");
      return;
    }

    if (detectNoSQLi(trimmedMessage)) {
      showValidationError("⚠️ Patrón sospechoso detectado (NoSQL)");
      return;
    }

    if (hasEncodedPayload(trimmedMessage)) {
      showValidationError("⚠️ Contenido codificado sospechoso detectado");
      return;
    }

    const rlStatus = getChatRateLimitStatus();
    if (rlStatus.blocked) {
      startBlockCountdown(rlStatus.blockedUntil);
      showValidationError(
        `⏳ Límite alcanzado. Espera ${formatBlockTime(rlStatus.blockedUntil - Date.now())} para continuar.`,
        true
      );
      return;
    }

    const now = Date.now();
    if (now - lastMessageTime < CHAT_SECURITY_CONFIG.cooldownPeriod) {
      const remaining = Math.ceil(
        (CHAT_SECURITY_CONFIG.cooldownPeriod - (now - lastMessageTime)) / 1000
      );
      showValidationError(`Espera ${remaining}s antes de enviar otro mensaje.`);
      return;
    }

    // Solo aplicar validación de seguridad para usuarios que no son reposteros
    console.log('[ChatBot] User role:', user?.role, 'User:', user);
    if (user?.role !== "repostero") {
      const validation = validateMessage(trimmedMessage);
      if (!validation.valid) {
        showValidationError(validation.error);
        return;
      }

      if (isSpamMessage(trimmedMessage, chat)) {
        showValidationError("Por favor evita repetir el mismo mensaje varias veces.");
        return;
      }
    }

    if (!trimmedMessage || isSending) return;

    const rlResult = checkAndRecordChatRateLimit();
    if (!rlResult.allowed) {
      startBlockCountdown(rlResult.blockedUntil);
      showValidationError(
        `⏳ Demasiados mensajes. Espera ${formatBlockTime(rlResult.blockedUntil - Date.now())} para continuar.`,
        true
      );
      return;
    }

    const sanitized = sanitizeMessage(trimmedMessage);
    setMessage("");
    setLastMessageTime(now);
    setValidationError("");
    setRateLimitStatus({ ...rlResult, blocked: false });
    _doSend(sanitized);
  };

  const sendMessage = (event) => {
    event.preventDefault();
    _handleSend(message);
  };

  const sendMessageText = (text, event) => {
    if (event) event.preventDefault();
    _handleSend(text);
  };

  const renderFormattedText = (text) => {
    const safeText = sanitizeDisplayText(text);
    if (!safeText) return null;

    const lines = safeText.split("\n");
    return lines.map((line, idx) => {
      let cleanLine = line.trim();
      if (!cleanLine) return <div key={idx} style={{ height: "4px" }} />;

      const isBullet =
        /^[*\-•]\s+/.test(cleanLine) ||
        /^\.\s+\*\*/.test(cleanLine) ||
        /^[*\-•]\s+\*\*/.test(cleanLine);
      if (isBullet) {
        cleanLine = cleanLine.replace(/^[*\-•.]\s+/, "").replace(/^\.\s+/, "");
      }

      const parts = cleanLine.split(/(\*\*.*?\*\*)/g);
      const lineContent = parts.map((part, pIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      if (isBullet) {
        return (
          <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "6px", margin: "4px 0" }}>
            <span style={{ color: "#c9a96e", flexShrink: 0, fontWeight: "bold" }}>•</span>
            <div>{lineContent}</div>
          </div>
        );
      }
      return <div key={idx} style={{ margin: "2px 0" }}>{lineContent}</div>;
    });
  };

  const renderRateLimitIndicator = () => {
    const { remaining, total, blocked } = rateLimitStatus;
    if (blocked || remaining >= total) return null;
    const pct = (remaining / total) * 100;
    const isLow = remaining <= 5;
    return (
      <div className={`chat-quota-bar ${isLow ? "low" : ""}`}>
        <div className="chat-quota-fill" style={{ width: `${pct}%` }} />
        <span className="chat-quota-label">{remaining}/{total} mensajes restantes</span>
      </div>
    );
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

            <div className="chat-header-right">
              <span className="chat-status">En línea</span>

              <div className="chat-menu" ref={menuRef}>
                <button
                  type="button"
                  className="chat-menu-trigger"
                  aria-label="Opciones del chat"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((prev) => !prev)}
                  disabled={isSending}
                >
                  <FaEllipsisV />
                </button>

                {menuOpen && (
                  <div className="chat-menu-dropdown" role="menu">
                    <button type="button" className="chat-menu-item" onClick={startNewChat} disabled={isSending}>
                      Nuevo chat
                    </button>
                    <button type="button" className="chat-menu-item danger" onClick={deleteCurrentChat} disabled={isSending}>
                      Borrar chat
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="chat-body" ref={chatBodyRef} role="log" aria-live="polite">
            {chat.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.sender}`}>
                <span className="chat-message-label">{msg.sender === "user" ? "Tú" : "Danhee"}</span>
                {renderFormattedText(msg.text)}
              </div>
            ))}

            {loadingState.status && (
              <div className="chat-loading-state">
                <span className="loading-spinner" />
                <span className="loading-text">{sanitizeDisplayText(loadingState.message)}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {renderRateLimitIndicator()}

          {validationError && (
            <div 
              id="chat-validation-error"
              className={`chat-validation-error ${validationError.startsWith("⏳") ? "blocked" : ""} shake`}
              role="alert"
              aria-live="assertive"
            >
              {validationError.startsWith("⏳") && (
                <FaShieldAlt style={{ marginRight: 6, flexShrink: 0 }} />
              )}
              {validationError}
              {blockCountdown > 0 && (
                <span className="block-countdown"> ({blockCountdown}s)</span>
              )}
            </div>
          )}

          <form className="chat-footer" onSubmit={sendMessage} aria-label="Formulario de chat">
            <button
              type="button"
              className={`mic-button ${isListening ? "active" : ""}`}
              onClick={toggleListening}
              title={isListening ? "Detener grabación" : "Grabar voz"}
              disabled={isSending || rateLimitStatus.blocked}
              aria-label={isListening ? "Detener grabación de voz" : "Iniciar grabación de voz"}
              aria-pressed={isListening}
            >
              {isListening ? <FaMicrophoneSlash /> : <FaMicrophone />}
            </button>

            <input
              type="text"
              placeholder={
                rateLimitStatus.blocked
                  ? `Bloqueado (${blockCountdown}s)...`
                  : isListening
                  ? "Escuchando..."
                  : "Pregunta algo..."
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSending || rateLimitStatus.blocked}
              maxLength={CHAT_SECURITY_CONFIG.maxMessageLength}
              autoComplete="off"
              spellCheck={false}
              aria-label="Mensaje del chat"
              aria-invalid={!!validationError}
              aria-describedby={validationError ? "chat-validation-error" : undefined}
            />

            <button
              type="submit"
              disabled={isSending || !message.trim() || rateLimitStatus.blocked}
            >
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
