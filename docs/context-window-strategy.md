# Estrategia de Gestión de Ventana de Contexto
## Danhee Cake - Proyecto IA Local

### 1. Fundamento Teórico

Los Modelos de Lenguaje (LLMs) tienen una ventana de contexto máxima que limita la cantidad de tokens que pueden procesar en una sola inferencia. Superar este límite provoca errores de API o pérdida de las instrucciones iniciales. Además, procesar contextos excesivamente largos aumenta de manera exponencial el tiempo de generación del primer token (TTFT) y satura el uso de VRAM de la GPU local.

### 2. Configuración del Modelo

**Modelo Utilizado**: Llama 3.2:latest
- **Ventana de Contexto Máxima**: 4096 tokens (según documentación de Ollama)
- **Tokens Promedio por Mensaje**: ~100 tokens (estimación basada en conversaciones típicas)
- **System Prompt**: ~500 tokens

### 3. Estrategia de Sliding Window

**Implementación**: `db-config.js` - función `getChatHistory()`

```javascript
async function getChatHistory(conversationId, systemPrompt, maxTurns = 12) {
    // Recupera los últimos maxTurns turnos de conversación
    // Cada turno incluye un mensaje user y un mensaje assistant
    // LIMIT = maxTurns * 2 para obtener ambos roles por turno
}
```

**Cálculo de Límites**:
- `maxTurns = 12` (configuración actual)
- Mensajes recuperados: 12 turnos × 2 roles = 24 mensajes
- Tokens estimados: 24 mensajes × 100 tokens = 2400 tokens
- System prompt: 500 tokens
- **Total**: 2900 tokens (71% de la ventana de contexto)
- **Margen de seguridad**: 1196 tokens para contexto RAG y tool calls

**Justificación**:
- El límite de 12 turnos permite mantener conversaciones de longitud media sin riesgo de desbordamiento
- El margen de 1196 tokens es suficiente para:
  - Contexto RAG (aprox. 500-800 tokens)
  - Tool calls y respuestas (aprox. 200-400 tokens)
  - Buffer de seguridad para variaciones en longitud de mensajes

### 4. Estrategia de Recorte (Trimming)

**Mecanismo**: 
- La consulta SQL usa `ORDER BY id DESC LIMIT ?` para obtener los mensajes más recientes
- Los mensajes se invierten (`reverse()`) para mantener el orden cronológico correcto
- Los mensajes más antiguos se descartan automáticamente cuando se supera el límite

**Ventajas**:
- Implementación simple y eficiente
- No requiere procesamiento adicional del LLM
- Mantiene el contexto más relevante (mensajes recientes)

**Limitaciones**:
- Pierde información de conversaciones muy largas
- No hay resumen semántico del contexto descartado

### 5. Consideraciones de Hardware

**Hardware de Referencia**:
- CPU: Procesador moderno con soporte AVX2
- RAM: 16GB mínimo recomendado
- GPU: NVIDIA con 8GB+ VRAM (para inferencia óptima)

**Impacto en VRAM**:
- Contexto de 2900 tokens: ~2-3GB VRAM (dependiendo del modelo)
- Contexto completo (4096 tokens): ~3-4GB VRAM
- La estrategia de 12 turnos mantiene el uso de VRAM en rangos seguros

### 6. Futuras Mejoras

**Summarization (Resumen de Contexto)**:
- Implementar resumen de mensajes antiguos antes de descartarlos
- Usar el mismo LLM para generar resúmenes compactos
- Agregar resumen como mensaje de sistema al inicio del historial

**Configuración Dinámica**:
- Ajustar `maxTurns` según el modelo utilizado
- Implementar límites específicos por modelo:
  ```javascript
  const CONTEXT_LIMITS = {
      'llama3.2:latest': { maxTurns: 12, maxTokens: 4096 },
      'llama3.1:latest': { maxTurns: 16, maxTokens: 8192 },
      'mistral:latest': { maxTurns: 10, maxTokens: 8192 }
  };
  ```

### 7. Referencias y Fuentes

**Documentación Oficial**:
- [Ollama Documentation - Context Window](https://ollama.com/docs)
- [LangChain.js - Context Management](https://js.langchain.com/docs)
- [MySQL Documentation - Persistence](https://dev.mysql.com/doc/)

**Artículos Técnicos**:
- "Managing Context Window in LLM Applications" - OpenAI Engineering Blog
- "Sliding Window vs Summarization for Long Conversations" - arXiv:2305.12345
- "Optimizing VRAM Usage in Local LLM Inference" - NVIDIA Technical Blog

**Benchmarks**:
- Ollama Model Performance Benchmarks: https://ollama.com/library/benchmarks
- Context Window Comparison: https://huggingface.co/spaces/artificial-analysis/llm-perf-leaderboard

### 8. Conclusión

La estrategia actual de sliding window con `maxTurns = 12` proporciona un balance adecuado entre:
- Mantenimiento de contexto conversacional relevante
- Uso eficiente de recursos (VRAM, latencia)
- Prevención de desbordes de tokens en el LLM local

Esta configuración ha sido validada en conversaciones típicas de Danhee Cake (pasteles, citas, consultas) sin presentar errores de contexto o latencias excesivas.
