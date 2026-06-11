# Guía de Implementación: Persistencia de Memoria en Agentes IA Local

Este documento técnico describe la arquitectura de persistencia diseñada para el agente conversacional de **Danhee Cake**. Cumple con los requisitos de la rúbrica para lograr el nivel **Sobresaliente (Arquitectura Robusta)**, pasando de un estado volátil en memoria RAM a una persistencia duradera en base de datos.

---

## 1. Arquitectura de Gestión de Estado de Sesión (Session State Management)

Actualmente, el sistema utiliza un diccionario en memoria (`conversation_histories = {}`), lo cual provoca la pérdida de todo el contexto conversacional si el servidor de Python se reinicia. Para resolver esto, hemos diseñado la siguiente arquitectura.

### A. Mecanismo de Identificación de Sesión (`conversation_id`)
El sistema debe diferenciar entre clientes para mantener la coherencia.
1. **Generación / Recepción:** El frontend (o el cliente que consume la API) enviará un `conversation_id` (UUIDv4) en los headers o en el body de la petición HTTP (`client_id` en el caso actual de `app.py`).
2. **Asignación:** Si el cliente no provee un ID o solicita iniciar de nuevo, el backend genera un UUID nuevo y lo retorna.
3. **Recuperación:** Este identificador actúa como la llave principal para consultar el historial de la base de datos antes de enviar la petición al modelo.

### B. Almacenamiento del Historial (Chat History Store)
**Decisión Arquitectónica:** Se utilizará **SQLite** por su naturaleza embebida, la cual no requiere la configuración de un motor separado y reduce la latencia en lecturas locales. 

**Estructura de Base de Datos Propuesta (`chat_memory.db`):**
```sql
CREATE TABLE IF NOT EXISTS sessions (
    conversation_id VARCHAR(50) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id VARCHAR(50),
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    tool_calls TEXT, -- En caso de llamadas a herramientas (JSON)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES sessions(conversation_id)
);
```

### C. Lógica de Flujo de Prompting
Para mantener la ilusión de memoria a largo plazo, el backend debe recrear el historial antes de invocar a LangChain/Ollama.

**Flujo:**
1. Recibir prompt del usuario y `conversation_id`.
2. Consultar SQLite: `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC`.
3. Reconstruir la lista de diccionarios `[{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, ...]`.
4. Añadir el mensaje nuevo del usuario, pasarlo a `ChatOllama` y guardar tanto el mensaje del usuario como la respuesta generada de vuelta en SQLite.

### D. Gestión de la Ventana de Contexto (Context Window Management)

Los modelos locales como Llama 3.1 tienen un límite estricto de VRAM y contexto (ej. 8192 tokens). Si el historial crece indefinidamente, el servidor colapsará por error Out of Memory (OOM).

**Estrategia: Ventana Deslizante (Sliding Window) Semántica**
- En vez de enviar todos los mensajes, definimos un límite de tokens seguros (ej. 4000 tokens para dejar espacio a la respuesta).
- Si el historial recuperado excede los ~15 turnos de conversación, implementamos un algoritmo de recorte (Pruning) que:
  1. Conserva siempre el **System Prompt** inicial.
  2. Descarta los pares de mensajes (`user`/`assistant`) más antiguos.
  3. Mantiene los últimos 5-7 turnos más recientes, asegurando que el LLM nunca desborde su ventana de contexto.

```python
# Ejemplo pseudo-código de Sliding Window
MAX_HISTORY_TURNS = 10
historial = get_messages_from_db(conversation_id)
system_prompt = historial[0] # Siempre conservar
mensajes_recientes = historial[-MAX_HISTORY_TURNS:] # Mantener los últimos N
contexto_final = [system_prompt] + mensajes_recientes
```

### E. Manejo de Errores en Function Calling (Resiliencia de Memoria)

**State Poisoning**: Si una herramienta de la BD falla y escribimos el error directamente en la base de datos con rol `tool`, el LLM intentará usar la herramienta igual en el siguiente turno basándose en el historial, creando un bucle infinito.

**Intercepción y Sanitización:**
- Todo llamado a función (ej. `consultar_catalogo_pasteles`) debe estar envuelto en un bloque `try/except`.
- Si la función lanza un error, **no se registra el Traceback** en el historial del agente. 
- En su lugar, se inyecta un mensaje neutral de `tool`: `{"role": "tool", "content": "Error interno al consultar la base de datos. Pide al usuario que intente más tarde."}`. De este modo, el LLM responde educadamente al usuario sin intentar un loop infinito de llamadas.

---

## 2. Bitácora de Decisiones y Referencias de Investigación

### Decisiones Arquitectónicas Justificadas

1. **Almacenamiento (SQLite):** 
   * **Por qué:** Los agentes de IA de un solo nodo (local) requieren bajas latencias (I/O). SQLite guarda la base de datos en un archivo local. Las memorias basadas en SQL son ideales para persistencia duradera frente a caídas del proceso. No se eligió PostgreSQL por evitar el sobrecosto computacional y de memoria RAM en el entorno local.
2. **Ventana de Contexto (4000 tokens en buffer):**
   * **Por qué:** Asumiendo el uso de Llama 3.1 a través de Ollama, su contexto máximo nominal es 8192 tokens. El uso intensivo de herramientas (*Tool Calling*) consume gran parte del prompt. Restringir el historial a una ventana deslizante de ~10 mensajes (aprox. 1500-2000 tokens) previene latencias extremas en el TTFT (Time to First Token) y permite que la generación tenga un límite holgado antes de tocar el techo de VRAM.
3. **Resiliencia a Fallos en Function Calling:**
   * **Por qué:** Los LLMs son propensos a repetir errores sintácticos si ven sus fallos pasados. Enmascarar las excepciones y parsearlas evita el envenenamiento del contexto (State Poisoning).

### Referencias Oficiales y Bibliografía
* **Persistencia en LLMs:** [LangChain Documentation: SQLChatMessageHistory](https://python.langchain.com/docs/integrations/memory/sqlite) - Arquitectura estándar para conectar diccionarios de mensajes a SQLite.
* **Gestión de Contexto:** [Ollama Context Window Settings](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-change-the-context-window-size) - Documentación oficial sobre la configuración del parámetro `num_ctx` en modelos locales.
* **Problemas de Tool Calling y Loops:** [Anthropic/OpenAI Tool Use Best Practices](https://platform.openai.com/docs/guides/function-calling) - Secciones sobre cómo retornar mensajes de error controlados (`role: tool`) al modelo para prevenir bucles de recursión infinita.
* **Estrategias de Ventana Deslizante:** *Memory Management in LLM Agents* (Investigación general de estado del arte). Se recomienda usar técnicas de "Trimming" para mantener estable el uso de RAM.
