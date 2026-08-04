# ANÁLISIS COMPLETO DEL SISTEMA RAG - DANHEE CAKE

**Fecha:** 04 de Agosto, 2026  
**Autor:** Análisis técnico del sistema RAG  
**Versión:** 1.0

---

## RESUMEN EJECUTIVO

El sistema RAG (Retrieval-Augmented Generation) de Danhee Cake es un microservicio de chatbot basado en IA que utiliza una arquitectura multi-agente con LangChain.js, Ollama (LLM local), y ChromaDB (base de datos vectorial). El sistema está diseñado para atender dos tipos de usuarios: **clientes** y **reposteros**, con funcionalidades específicas para cada rol.

### Estado Actual: ⚠️ NO FUNCIONAL EN PRODUCCIÓN
El servicio RAG no está disponible, causando que todos los mensajes al chatbot retornen "Error en el servicio RAG".

---

## ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│                    https://danhee-cake.vercel.app               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ POST /api/chat/stream
                         │ GET /api/chat/history
                         │ DELETE /api/chat/history
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NODE SERVER (Express.js)                       │
│                   Puerto: 4000                                   │
│                   Middleware:                                    │
│                   - clientChatGuard (validaciones)              │
│                   - CSRF protection                             │
│                   - Rate limiting                               │
│                   - Autenticación JWT                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP interno con X-RAG-Secret
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   RAG SERVICE (Express.js)                       │
│                   Puerto: 5001                                   │
│                   Archivo: server/rag/app.js                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ TaskRouter (orquestador)
                         ▼
        ┌────────────────┴────────────────┐
        │                                  │
        ▼                                  ▼
┌──────────────────┐            ┌──────────────────┐
│ CustomerAgent    │            │ BakerAgent       │
│ (clientes)       │            │ (reposteros)     │
└────────┬─────────┘            └────────┬─────────┘
         │                                │
         │                                │
         ▼                                ▼
┌──────────────────────────────────────────────────────────┐
│              AdvancedRAGAgent (opcional)                 │
│              - ChromaDB (vector store)                   │
│              - Ollama embeddings                         │
│              - Búsqueda híbrida                          │
└──────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│              Ollama LLM (llama3.2:latest)                │
│              - Function calling                          │
│              - Streaming tokens                          │
│              - Contexto: 2048 tokens                     │
└──────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│              MySQL Database                              │
│              - chat_sessions                             │
│              - chat_messages                             │
│              - cakes                                     │
│              - baker_profiles                            │
│              - appointments                              │
│              - categories                                │
└──────────────────────────────────────────────────────────┘
```

---

## COMPONENTES DETALLADOS

### 1. RAG Service (server/rag/app.js)

**Propósito:** Microservicio HTTP que recibe solicitudes del Node Server principal y las procesa usando agentes de IA.

**Endpoints:**
- `POST /chat/stream` - Streaming de respuestas token por token (SSE)
- `POST /chat` - Respuesta síncrona completa
- `GET /chat/history/:conversationId` - Obtener historial por conversación
- `GET /chat/history?client_id=X` - Obtener historial por cliente
- `DELETE /chat/:conversationId` - Eliminar conversación
- `GET /health` - Health check

**Autenticación:**
- Header `X-RAG-Secret` requerido (compartido con Node Server)
- Validado en middleware `authenticateRAGRequest`

**Inicialización:**
```javascript
async function initializeClients() {
    chromaClient = new ChromaClient({ path: process.env.CHROMA_HOST });
    taskRouter = new TaskRouter(chromaClient);
}
```

---

### 2. TaskRouter (server/rag/agents/router.js)

**Propósito:** Orquestador que enruta las solicitudes al agente apropiado según el rol del usuario.

**Lógica de enrutamiento:**
```javascript
async route(conversationId, userMessage, userRole, userId) {
    if (normalizedRole === 'repostero' || 'baker') {
        return await this.bakerAgent.processMessage(...);
    } else {
        return await this.customerAgent.processMessage(...);
    }
}
```

**Agentes disponibles:**
- `CustomerAgent` - Para clientes (rol: 'cliente')
- `BakerAgent` - Para reposteros (rol: 'repostero')
- `AdvancedRAGAgent` - Agente RAG con búsqueda vectorial (opcional)

---

### 3. CustomerAgent (server/rag/agents/customer-agent.js)

**Propósito:** Agente especializado para atender consultas de clientes.

**Características:**
- **Modelo LLM:** `llama3.2:latest` vía Ollama
- **Temperatura:** 0.7 (balance entre creatividad y precisión)
- **Contexto máximo:** 2048 tokens
- **Predicción máxima:** 2048 tokens

**Flujo de procesamiento:**

1. **Respuestas fijas:** Detecta saludos y preguntas frecuentes con respuestas predefinidas
2. **Guardrails:** Bloquea patrones peligrosos (prompt injection, SQL injection, etc.)
3. **Cache:** Cachea respuestas para preguntas idénticas (TTL: 15 segundos)
4. **Verificación de autenticación:** Requiere login para consultas personales
5. **Detección de ciclos:** Evita bucles de respuestas repetitivas
6. **Function Calling:** Usa herramientas para obtener datos en tiempo real
7. **RAG (opcional):** Recupera contexto de ChromaDB si está disponible
8. **Streaming:** Envía tokens uno por uno vía callback

**Herramientas disponibles (25+):**
- `consultar_catalogo_pasteles` - Ver catálogo completo
- `buscar_pastel_por_nombre` - Búsqueda por nombre
- `consultar_reposteros_disponibles` - Lista de reposteros
- `verificar_disponibilidad_repostero` - Verificar fecha disponible
- `registrar_solicitud_cita` - Agendar cita de degustación
- `calcular_precio_personalizado` - Calcular precio de pastel personalizado
- `recomendar_pastel` - Recomendaciones por ocasión/presupuesto
- `consultar_mis_citas` - Ver citas del cliente
- `consultar_mis_disenos` - Ver diseños personalizados
- Y 15+ herramientas más...

**System Prompt:**
```
Eres un asistente virtual amable y profesional de Danhee Cake...
- Siempre responde en español de México
- Usa un tono cálido, empático y servicial
- Nunca inventes datos de pasteles, precios o reposteros
- RESPUESTAS CORTAS: 2-3 oraciones máximo
- NUNCA repitas saludos en cada respuesta
```

---

### 4. BakerAgent (server/rag/agents/baker-agent.js)

**Propósito:** Agente especializado para atender consultas de reposteros.

**Características:**
- **Modelo LLM:** `llama3.2:latest` vía Ollama
- **Temperatura:** 0.6 (más conservador para acciones críticas)
- **Adaptación de formalidad:** Detecta si el usuario es formal o casual
- **Confirmación de acciones:** Confirma antes de modificar datos

**Herramientas disponibles (7):**
- `listar_mis_pasteles` - Ver catálogo propio
- `agregar_nuevo_pastel` - Agregar pastel al catálogo
- `actualizar_mi_pastel` - Modificar pastel existente
- `eliminar_mi_pastel` - Eliminar pastel del catálogo
- `listar_categorias_disponibles` - Ver categorías
- `consultar_mis_citas_repostero` - Ver citas agendadas
- `obtener_contexto_repostero` - Información del negocio

**System Prompt:**
```
Eres un asistente virtual profesional y eficiente para reposteros...
- Sé conciso y directo
- Confirma las acciones de modificación antes de ejecutarlas
- Adapta tu tono según la formalidad detectada
```

---

### 5. AdvancedRAGAgent (server/rag/agents/rag-agent.js)

**Propósito:** Implementa búsqueda híbrida y reranking usando ChromaDB y embeddings de Ollama.

**Componentes:**
- **ChromaDB:** Base de datos vectorial para almacenamiento de documentos
- **Ollama Embeddings:** Modelo `nomic-embed-text` para generar embeddings
- **Colección:** `danhee_knowledge`

**Flujo de búsqueda:**

1. **Hybrid Search:**
   ```javascript
   async hybridSearch(query, topK = 5) {
       // Búsqueda vectorial con similitud de coseno
       const results = await this.vectorStore.similaritySearchWithScore(query, topK);
       // Filtrar por umbral mínimo de relevancia (0.3)
       return results.filter(([doc, score]) => score >= 0.3);
   }
   ```

2. **Reranking:**
   ```javascript
   async rerankResults(query, documents) {
       // Ordenar por score de relevancia
       return docsWithScores.sort((a, b) => b.rerankScore - a.rerankScore);
   }
   ```

3. **Diversificación:**
   ```javascript
   // Máximo 2 documentos de la misma fuente
   if (sourceCount[source] <= 2) {
       diversified.push(doc);
   }
   ```

**Estado actual:** ⚠️ ChromaDB no está disponible en producción, por lo que el RAG está deshabilitado.

---

### 6. Base de Datos (server/rag/db-config.js)

**Tablas utilizadas:**

#### chat_sessions
```sql
CREATE TABLE chat_sessions (
    conversation_id VARCHAR(255) PRIMARY KEY,
    client_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### chat_messages
```sql
CREATE TABLE chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(255),
    role ENUM('user', 'assistant', 'system', 'tool'),
    content TEXT,
    tool_calls JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES chat_sessions(conversation_id)
);
```

#### observability_logs
```sql
CREATE TABLE observability_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255),
    user_prompt TEXT,
    system_response TEXT,
    ttft_ms INT,
    total_latency_ms INT,
    tokens_per_second FLOAT,
    was_blocked BOOLEAN,
    tools_executed JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Funciones de acceso a datos:**
- `getOrCreateChatSession()` - Crear o recuperar sesión de chat
- `getChatHistory()` - Obtener historial de mensajes
- `addChatMessage()` - Agregar mensaje al historial
- `getCakes()` - Obtener catálogo de pasteles (con cache)
- `getBakers()` - Obtener lista de reposteros (con cache)
- `insertAppointment()` - Agendar cita de degustación
- Y 20+ funciones más...

**Cache en memoria:**
```javascript
const CACHE_TTL = 120; // 2 minutos
const CACHE_TTL_LONG = 600; // 10 minutos para categorías
const MAX_CACHE_SIZE = 1000; // Límite máximo de entradas
```

---

### 7. Herramientas (Tools)

#### Customer Tools (server/rag/tools/customer-tools.js)

**Funciones principales:**

1. **consultarCatalogoPasteles(categoria, contexto_anterior)**
   - Consulta el catálogo completo o filtrado por categoría
   - Usa cache para mejorar rendimiento
   - Retorna: lista de pasteles con nombre, descripción, precio, categoría

2. **registrarSolicitudCita(baker_id, fecha, hora, notas, client_name)**
   - Registra una solicitud de cita de degustación
   - Verifica disponibilidad antes de insertar
   - Retorna: confirmación o error

3. **calcularPrecioPersonalizado(tamanio, relleno, decoracion)**
   - Calcula precio estimado de pastel personalizado
   - Basado en tamaños y componentes
   - Retorna: precio estimado

4. **recomendarPastel(ocasion, presupuesto, estilo)**
   - Recomienda pasteles según ocasión y presupuesto
   - Usa algoritmo de matching
   - Retorna: lista de pasteles recomendados

#### Baker Tools (server/rag/tools/baker-tools.js)

**Funciones principales:**

1. **listarMisPasteles()**
   - Lista todos los pasteles del repostero actual
   - Usa `getCurrentClientId()` para identificar al repostero
   - Retorna: lista de pasteles con detalles

2. **agregarNuevoPastel(nombre, descripcion, precio, categoria_id, is_featured)**
   - Agrega nuevo pastel al catálogo
   - Valida permisos del repostero
   - Retorna: ID del pastel creado

3. **actualizarMiPastel(cake_id, nombre, descripcion, precio, categoria_id)**
   - Actualiza pastel existente
   - Verifica que el pastel pertenezca al repostero
   - Retorna: confirmación o error

4. **eliminarMiPastel(cake_id)**
   - Elimina pastel del catálogo
   - Verifica permisos antes de eliminar
   - Retorna: confirmación o error

---

### 8. Utilidades Comunes (server/rag/tools/common-tools.js)

**Funciones de seguridad:**

1. **checkGuardrails(prompt)**
   - Detecta patrones peligrosos en el prompt
   - Bloquea: prompt injection, SQL injection, XSS, jailbreak
   - Lista de 100+ patrones prohibidos
   - Retorna: `true` si debe bloquear, `false` si es seguro

2. **detectarFormalidad(texto)**
   - Detecta si el usuario es formal, casual o neutral
   - Basado en indicadores lingüísticos
   - Retorna: 'formal', 'casual', 'neutral'

3. **detectCycle(chatHistory, threshold)**
   - Detecta bucles de respuestas repetitivas
   - Usa similitud de coseno entre respuestas
   - Retorna: `true` si hay ciclo, `false` si no

4. **removeRepeatedGreetings(response)**
   - Remueve saludos repetidos de la respuesta
   - Lista de saludos comunes en español
   - Retorna: respuesta limpia

**Funciones de cache:**

1. **getCachedResponse(question, role, conversationId)**
   - Obtiene respuesta cacheada si existe
   - TTL: 15 segundos
   - Solo para usuarios no autenticados

2. **setCachedResponse(question, role, response, conversationId)**
   - Almacena respuesta en cache
   - Clave: `${role}:${normalizeQuestion(question)}`

**Funciones de contexto:**

1. **shouldSkipRag(question)**
   - Determina si debe omitir RAG
   - Basado en palabras clave
   - Retorna: `true` si debe omitir, `false` si debe usar RAG

2. **shouldUseTools(question, role)**
   - Determina si debe usar herramientas
   - Basado en palabras clave y rol
   - Retorna: `true` si debe usar tools, `false` si no

3. **requiresAuthCheck(question)**
   - Determina si requiere autenticación
   - Basado en palabras clave personales ("mi perfil", "mis citas")
   - Retorna: `true` si requiere auth, `false` si no

---

## FLUJO COMPLETO DE UNA SOLICITUD

### Escenario: Cliente pregunta "¿Qué pasteles tienes disponibles?"

```
1. FRONTEND (React)
   │
   │ POST /api/chat/stream
   │ Body: { message: "¿Qué pasteles tienes disponibles?", conversation_id: "abc123" }
   │ Headers: { X-CSRF-Token: "xyz", Authorization: "Bearer jwt_token" }
   │
   ▼
2. NODE SERVER (Express.js)
   │
   │ Middleware chain:
   │ - cors() ✓
   │ - cookieParser() ✓
   │ - detectCookieTampering() ✓
   │ - validateCookieFingerprint() ✓
   │ - requestGuard() ✓
   │ - httpsEnforcer() ✓
   │ - securityLogger() ✓
   │ - ipRateLimiter() ✓
   │ - inputSanitizer() ✓
   │ - helmet() ✓
   │ - advancedSecurity() ✓
   │ - httpSecurity() ✓
   │ - validateBodySize() ✓
   │ - apiGuard() ✓
   │ - apiFuzzingGuard() ✓
   │ - sanitizeQueryParams() ✓
   │ - methodBlocker() ✓
   │ - sqlInjectionBlocker() ✓
   │ - sanitize() ✓
   │ - auditLogger() ✓
   │ - apiLimiter() ✓
   │ - methodLimiter() ✓
   │ - writeLimiter() ✓
   │ - readLimiter() ✓
   │ - validateHostHeader() ✓
   │ - ipBlocker() ✓
   │ - attackDetector() ✓
   │ - conditionalCsrfProtection() ✓
   │ - chatLimiter() ✓
   │ - clientChatGuard() ← Validaciones específicas de chat
   │
   ▼
3. clientChatGuard Middleware
   │
   │ - Extrae rol del JWT (cliente/repostero)
   │ - Valida longitud del mensaje (max 2000 chars)
   │ - Verifica cooldown (2 segundos entre mensajes)
   │ - Verifica mensajes repetidos (85% similitud)
   │ - Verifica rate limit (20 mensajes/minuto)
   │ - Detecta patrones de ataque (prompt injection, jailbreak)
   │ - Sanitiza caracteres de control
   │
   ▼
4. streamChatbot Controller (server/src/controllers/chat.controller.js)
   │
   │ - Valida mensaje (max 5000 chars)
   │ - Valida conversation_id
   │ - Extrae client_id y role del JWT
   │ - Guarda ownership de conversación en DB
   │ - Genera conversation_id si no existe
   │
   │ POST http://rag-service:5001/chat/stream
   │ Headers: { X-RAG-Secret: "secret", Content-Type: "application/json" }
   │ Body: {
   │   conversation_id: "abc123",
   │   user_message: "¿Qué pasteles tienes disponibles?",
   │   user_role: "cliente",
   │   user_id: 42
   │ }
   │
   ▼
5. RAG SERVICE (server/rag/app.js)
   │
   │ authenticateRAGRequest() ✓
   │ - Valida header X-RAG-Secret
   │
   ▼
6. TaskRouter.routeStreaming()
   │
   │ - Determina agente según user_role
   │ - user_role === 'cliente' → CustomerAgent
   │ - user_role === 'repostero' → BakerAgent
   │
   ▼
7. CustomerAgent.processStreaming()
   │
   │ 7.1. setCurrentClientId(42)
   │      - Almacena client_id en AsyncLocalStorage
   │
   │ 7.2. obtenerRespuestaFija("¿Qué pasteles tienes disponibles?")
   │      - No es saludo ni pregunta frecuente
   │      - Retorna: null
   │
   │ 7.3. checkGuardrails("¿Qué pasteles tienes disponibles?")
   │      - No contiene patrones peligrosos
   │      - Retorna: false (seguro)
   │
   │ 7.4. getOrCreateChatSession("abc123", 42)
   │      - INSERT INTO chat_sessions ... ON DUPLICATE KEY UPDATE
   │
   │ 7.5. getChatHistory("abc123", systemPrompt)
   │      - SELECT role, content FROM chat_messages WHERE conversation_id = ?
   │      - Retorna: [{ role: 'system', content: systemPrompt }]
   │
   │ 7.6. detectCycle(chatHistory)
   │      - No hay suficientes mensajes para detectar ciclo
   │      - Retorna: false
   │
   │ 7.7. shouldUseTools("¿Qué pasteles tienes disponibles?", 'cliente')
   │      - Contiene palabra clave: "pasteles"
   │      - Retorna: true
   │
   │ 7.8. shouldSkipRag("¿Qué pasteles tienes disponibles?")
   │      - Contiene palabra clave: "pasteles"
   │      - Retorna: false (no omitir RAG)
   │
   │ 7.9. ragAgent.retrieveContext("¿Qué pasteles tienes disponibles?", 3)
   │      - ⚠️ ChromaDB no disponible
   │      - Retorna: []
   │
   │ 7.10. ollamaClient.chat() con tools
   │       - Model: llama3.2:latest
   │       - Messages: [system, user]
   │       - Tools: TOOLS_SCHEMA (25+ herramientas)
   │       - Options: { temperature: 0.5, num_ctx: 2048 }
   │
   │       LLM decide llamar a: consultar_catalogo_pasteles()
   │
   │ 7.11. executeTool("consultar_catalogo_pasteles", {})
   │       - Llama a customerTools.consultarCatalogoPasteles()
   │       - Query: SELECT * FROM cakes ... LIMIT 500
   │       - Retorna: [{ id: 1, name: "Red Velvet", price: 450, ... }, ...]
   │
   │ 7.12. ollamaClient.chat() con resultado de tool
   │       - Messages: [system, user, tool]
   │       - LLM genera respuesta final
   │
   │ 7.13. removeRepeatedGreetings(responseText)
   │       - Remueve saludos repetidos si existen
   │
   │ 7.14. filterAlucinatoryResponse(response, originalQuery)
   │       - Verifica frases prohibidas en respuestas cortas
   │
   │ 7.15. addChatMessage("abc123", 'user', "¿Qué pasteles tienes disponibles?")
   │       - INSERT INTO chat_messages ...
   │
   │ 7.16. addChatMessage("abc123", 'assistant', "Tenemos disponibles...")
   │       - INSERT INTO chat_messages ...
   │
   │ 7.17. addObservabilityLog(...)
   │       - INSERT INTO observability_logs ...
   │
   │ 7.18. Streaming response
   │       - for await (const chunk of stream) { onToken(chunk.content) }
   │       - Envía tokens uno por uno vía SSE
   │
   ▼
8. NODE SERVER (streaming proxy)
   │
   │ - Lee stream del RAG service
   │ - Procesa cada línea con processStreamLine()
   │ - Marca respuestas bloqueadas con was_blocked: true
   │ - Reenvía tokens al frontend vía SSE
   │
   ▼
9. FRONTEND (React)
   │
   │ - Lee stream SSE
   │ - Actualiza UI token por token
   │ - Muestra respuesta completa al finalizar
   │
   ▼
10. USUARIO
    │
    │ Ve la respuesta del chatbot en tiempo real
    │
    ▼
```

---

## PROBLEMAS IDENTIFICADOS

### 🔴 CRÍTICOS

#### 1. Servicio RAG no disponible en producción
**Impacto:** El chatbot no funciona en absoluto  
**Causa:** El servicio RAG no está corriendo o no es accesible desde el Node Server  
**Evidencia:** Todas las pruebas retornan "Error en el servicio RAG"  
**Solución:** 
- Verificar que el servicio RAG esté corriendo en `http://rag-service:5001`
- Verificar conectividad de red entre Node Server y RAG Service
- Revisar logs del servicio RAG para identificar errores de inicialización

#### 2. ChromaDB no disponible
**Impacto:** El RAG (búsqueda vectorial) está completamente deshabilitado  
**Causa:** ChromaDB no está corriendo o no es accesible  
**Evidencia:** Logs muestran "ChromaDB no disponible"  
**Solución:**
- Iniciar ChromaDB: `docker run -p 8000:8000 chromadb/chroma`
- Verificar variable de entorno `CHROMA_HOST=http://chromadb:8000`
- Ejecutar `init-chroma.js` para inicializar la colección `danhee_knowledge`

#### 3. Ollama no disponible o lento
**Impacto:** Las respuestas del chatbot son lentas o fallan  
**Causa:** Ollama no está corriendo o el modelo `llama3.2:latest` no está descargado  
**Solución:**
- Iniciar Ollama: `ollama serve`
- Descargar modelo: `ollama pull llama3.2:latest`
- Descargar modelo de embeddings: `ollama pull nomic-embed-text`
- Verificar variable de entorno `OLLAMA_HOST=http://host.docker.internal:11434`

### 🟡 MEDIOS

#### 4. Falta de health checks robustos
**Impacto:** Dificultad para diagnosticar problemas  
**Causa:** No hay endpoints que verifiquen el estado de ChromaDB y Ollama  
**Solución:**
```javascript
app.get('/health/detailed', async (req, res) => {
    const chromaOk = await checkChromaDB();
    const ollamaOk = await checkOllama();
    res.json({ chroma: chromaOk, ollama: ollamaOk });
});
```

#### 5. Cache en memoria no persistente
**Impacto:** Pérdida de cache al reiniciar el servicio  
**Causa:** Cache usa `Map()` en memoria  
**Solución:** Usar Redis o similar para cache distribuido y persistente

#### 6. Sin fallback cuando RAG falla
**Impacto:** El chatbot responde con "Error en el servicio RAG"  
**Causa:** No hay mecanismo de fallback cuando el RAG service no responde  
**Solución:**
```javascript
if (!ragRes.ok) {
    // Fallback a respuesta sin RAG
    const fallbackResponse = await generateWithoutRAG(userMessage);
    res.write(`data: ${JSON.stringify({ type: 'response', content: fallbackResponse })}\n\n`);
}
```

### 🟢 MENORES

#### 7. System prompts muy largos
**Impacto:** Consumo excesivo de tokens  
**Causa:** System prompts tienen 500+ tokens  
**Solución:** Resumir system prompts manteniendo solo instrucciones críticas

#### 8. Sin limitación de historial de chat
**Impacto:** Contexto puede exceder 2048 tokens  
**Causa:** `getChatHistory()` no limita el número de mensajes  
**Solución:**
```javascript
const limitValue = parseInt(maxTurns * 2); // maxTurns = 12
// Ya está implementado, pero verificar que funcione correctamente
```

#### 9. Tool calling no optimizado
**Impacto:** Múltiples llamadas a herramientas en secuencia  
**Causa:** Cada herramienta se ejecuta una por una  
**Solución:** Ejecutar herramientas en paralelo cuando sea posible

---

## CONFIGURACIÓN REQUERIDA

### Variables de entorno (.env)

```env
# Base de datos MySQL
DB_HOST=bvtdjsmypbwpngczasgf-mysql.services.clever-cloud.com
DB_PORT=3306
DB_NAME=bvtdjsmypbwpngczasgf
DB_USER=ueixm6eypteu4pjt
DB_PASSWORD=***

# JWT
JWT_SECRET=***
REFRESH_TOKEN_SECRET=***

# RAG Service
RAG_SERVICE_URL=http://rag-service:5001
RAG_SERVICE_SECRET=***
RAG_PORT=5001

# Ollama
OLLAMA_HOST=host.docker.internal

# ChromaDB
CHROMA_HOST=http://chromadb:8000

# Frontend
FRONTEND_URL=https://danhee-cake.vercel.app
VITE_BASE_URL=https://api.danhee.com
```

### Servicios requeridos

1. **MySQL** - Base de datos principal
2. **Ollama** - LLM local (llama3.2:latest, nomic-embed-text)
3. **ChromaDB** - Base de datos vectorial
4. **RAG Service** - Microservicio de chatbot (puerto 5001)
5. **Node Server** - Servidor principal (puerto 4000)

### Comandos de inicio

```bash
# 1. Iniciar MySQL (Docker)
docker run -d -p 3306:3306 --name mysql \
  -e MYSQL_ROOT_PASSWORD=*** \
  -e MYSQL_DATABASE=danhee_db \
  mysql:8.0

# 2. Iniciar ChromaDB (Docker)
docker run -d -p 8000:8000 --name chromadb \
  chromadb/chroma:latest

# 3. Iniciar Ollama
ollama serve

# 4. Descargar modelos
ollama pull llama3.2:latest
ollama pull nomic-embed-text

# 5. Inicializar ChromaDB
cd server/rag
node init-chroma.js

# 6. Iniciar RAG Service
cd server/rag
npm start

# 7. Iniciar Node Server
cd server
npm start
```

---

## MÉTRICAS Y OBSERVABILIDAD

### Métricas recopiladas

1. **Latencia:**
   - TTFT (Time To First Token): Tiempo hasta el primer token
   - Total latency: Tiempo total de procesamiento
   - Tokens per second: Velocidad de generación

2. **Uso de herramientas:**
   - Herramientas ejecutadas por solicitud
   - Errores de herramientas
   - Tiempo de ejecución por herramienta

3. **Seguridad:**
   - Solicitudes bloqueadas por guardrails
   - Patrones de ataque detectados
   - Intentos de prompt injection

4. **Cache:**
   - Hit rate de cache
   - Tamaño de cache
   - Eviction rate

### Logs importantes

```javascript
// RAG Service
console.error('[app] 🚀 Servidor RAG escuchando en puerto 5001');
console.error('[app] ✅ Cliente ChromaDB inicializado');
console.error('[app] ✅ TaskRouter inicializado');

// CustomerAgent
console.log(`[CustomerAgent] Auth check - needsAuth: ${needsAuth}`);
console.error(`[CustomerAgent] Error en RAG: ${e.message}`);

// BakerAgent
console.error(`[BakerAgent] Error ejecutando ${toolName}: ${e.message}`);

// Security
console.warn('[Security] Intento de sobrescribir client_id ya establecido');
console.log('[clientChatGuard] Attack pattern detected:', attackPattern);
```

---

## RECOMENDACIONES DE MEJORA

### Corto plazo (1-2 semanas)

1. **Implementar health checks detallados**
   - Verificar estado de ChromaDB, Ollama, y MySQL
   - Exponer endpoint `/health/detailed`

2. **Agregar fallback cuando RAG falla**
   - Respuesta predefinida cuando el servicio no está disponible
   - No exponer errores internos al usuario

3. **Optimizar system prompts**
   - Reducir longitud a 200-300 tokens
   - Mantener solo instrucciones críticas

4. **Implementar rate limiting por usuario**
   - Prevenir abuso del chatbot
   - Limitar a 20 mensajes/minuto por usuario

### Mediano plazo (1-2 meses)

5. **Migrar cache a Redis**
   - Cache distribuido y persistente
   - Mejor rendimiento bajo carga

6. **Implementar streaming real token-por-token**
   - Actualmente el streaming es simulado
   - Usar Ollama streaming nativo

7. **Agregar más herramientas**
   - Búsqueda por ingredientes
   - Recomendaciones basadas en historial
   - Integración con pasarelas de pago

8. **Implementar A/B testing**
   - Probar diferentes system prompts
   - Medir satisfacción del usuario

### Largo plazo (3-6 meses)

9. **Migrar a LLM más potente**
   - Evaluar Llama 3.1 70B o similar
   - Balance entre calidad y velocidad

10. **Implementar fine-tuning**
    - Entrenar modelo con datos de Danhee Cake
    - Mejorar precisión en respuestas específicas

11. **Agregar soporte multilingüe**
    - Inglés y portugués además de español
    - Detección automática de idioma

12. **Implementar análisis de sentimiento**
    - Detectar frustración del usuario
    - Escalar a agente humano cuando sea necesario

---

## CONCLUSIÓN

El sistema RAG de Danhee Cake tiene una arquitectura sólida y bien diseñada, con múltiples capas de seguridad, cache, y observabilidad. Sin embargo, actualmente **no está funcional en producción** debido a problemas de infraestructura (servicio RAG, ChromaDB, Ollama no disponibles).

**Prioridades inmediatas:**
1. ✅ Hacer que el servicio RAG esté disponible
2. ✅ Iniciar ChromaDB y Ollama
3. ✅ Implementar health checks
4. ✅ Agregar fallback cuando RAG falla

Una vez resueltos estos problemas, el chatbot debería funcionar correctamente y proporcionar una experiencia útil para clientes y reposteros.

---

## ANEXO: DIAGRAMA DE SECUENCIA

```
Usuario          Frontend         Node Server      RAG Service      CustomerAgent    Ollama LLM       MySQL
  │                  │                  │                  │                  │                  │              │
  │ "¿Qué pasteles   │                  │                  │                  │                  │              │
  │  tienes?"        │                  │                  │                  │                  │              │
  │─────────────────>│                  │                  │                  │                  │              │
  │                  │ POST /chat/stream│                  │                  │                  │              │
  │                  │─────────────────>│                  │                  │                  │              │
  │                  │                  │ POST /chat/stream│                  │                  │              │
  │                  │                  │ (X-RAG-Secret)   │                  │                  │              │
  │                  │                  │─────────────────>│                  │                  │              │
  │                  │                  │                  │ routeStreaming() │                  │              │
  │                  │                  │                  │─────────────────>│                  │              │
  │                  │                  │                  │                  │ checkGuardrails()│              │
  │                  │                  │                  │                  │─────────────────>│              │
  │                  │                  │                  │                  │<─────────────────│              │
  │                  │                  │                  │                  │                  │              │
  │                  │                  │                  │                  │ getChatHistory() │              │
  │                  │                  │                  │                  │─────────────────────────────────>│
  │                  │                  │                  │                  │<─────────────────────────────────│
  │                  │                  │                  │                  │                  │              │
  │                  │                  │                  │                  │ shouldUseTools() │              │
  │                  │                  │                  │                  │─────────────────>│              │
  │                  │                  │                  │                  │<─────────────────│              │
  │                  │                  │                  │                  │                  │              │
  │                  │                  │                  │                  │ ollama.chat()    │              │
  │                  │                  │                  │                  │ with tools       │              │
  │                  │                  │                  │                  │─────────────────>│              │
  │                  │                  │                  │                  │<─────────────────│              │
  │                  │                  │                  │                  │ tool_calls:      │              │
  │                  │                  │                  │                  │ consultar_catalogo            │
  │                  │                  │                  │                  │                  │              │
  │                  │                  │                  │                  │ executeTool()    │              │
  │                  │                  │                  │                  │─────────────────────────────────>│
  │                  │                  │                  │                  │<─────────────────────────────────│
  │                  │                  │                  │                  │ [pasteles data]  │              │
  │                  │                  │                  │                  │                  │              │
  │                  │                  │                  │                  │ ollama.chat()    │              │
  │                  │                  │                  │                  │ with tool result │              │
  │                  │                  │                  │                  │─────────────────>│              │
  │                  │                  │                  │                  │<─────────────────│              │
  │                  │                  │                  │                  │ "Tenemos Red     │              │
  │                  │                  │                  │                  │  Velvet, Chocolate..."          │
  │                  │                  │                  │                  │                  │              │
  │                  │                  │                  │                  │ addChatMessage() │              │
  │                  │                  │                  │                  │─────────────────────────────────>│
  │                  │                  │                  │                  │<─────────────────────────────────│
  │                  │                  │                  │                  │                  │              │
  │                  │                  │                  │<─────────────────│                  │              │
  │                  │                  │                  │ stream response  │                  │              │
  │                  │                  │<─────────────────│                  │                  │              │
  │                  │                  │ SSE tokens       │                  │                  │              │
  │                  │<─────────────────│                  │                  │                  │              │
  │                  │ SSE tokens       │                  │                  │                  │              │
  │<─────────────────│                  │                  │                  │                  │              │
  │ "Tenemos Red     │                  │                  │                  │                  │              │
  │  Velvet..."      │                  │                  │                  │                  │              │
  │                  │                  │                  │                  │                  │              │
```

---

**Fin del documento**
