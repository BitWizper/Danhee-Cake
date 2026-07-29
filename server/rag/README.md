# Danhee Cake RAG - JavaScript/Node.js

Este es el microservicio de chatbot RAG de Danhee Cake implementado en JavaScript/Node.js.

## Estructura del Proyecto

```
rag/
├── app.js                    # Servidor HTTP principal
├── db-config.js              # Configuración y acceso a MySQL
├── package.json              # Dependencias del proyecto
├── agents/
│   ├── router.js            # TaskRouter - orquestador de agentes
│   ├── customer-agent.js    # Agente para clientes
│   ├── baker-agent.js       # Agente para reposteros
│   └── rag-agent.js         # Agente RAG avanzado
├── tools/
│   ├── common-tools.js      # Utilidades compartidas
│   ├── customer-tools.js    # Herramientas para clientes
│   ├── baker-tools.js       # Herramientas para reposteros
│   └── registry.js          # Registro de herramientas
└── data/                     # Directorio para datos locales
```

## Instalación

```bash
cd server/rag-js
npm install
```

## Configuración

Asegúrate de tener las siguientes variables de entorno en tu archivo `.env` (en el directorio `server/`):

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=danhee_cake
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña

OLLAMA_HOST=http://localhost:11434
CHROMA_HOST=http://localhost:8000

RAG_PORT=5001
```

## Ejecución

```bash
# Producción
npm start

# Desarrollo (con nodemon)
npm run dev
```

El servidor se iniciará en el puerto 5001 (configurable vía `RAG_PORT`).

## Endpoints

### Health Check
```
GET /health
```

### Chat (Síncrono)
```
POST /chat
Content-Type: application/json

{
  "conversation_id": "conv-123",
  "user_message": "¿Qué pasteles tienes disponibles?",
  "user_role": "cliente",
  "user_id": 123
}
```

### Chat History
```
GET /chat/history/:conversationId
```

### Delete Conversation
```
DELETE /chat/:conversationId?client_id=123
```

### Chat Streaming
```
POST /chat/stream
Content-Type: application/json

{
  "conversation_id": "conv-123",
  "user_message": "¿Qué pasteles tienes disponibles?",
  "user_role": "cliente",
  "user_id": 123
}
```

## Arquitectura

### Agentes

- **TaskRouter**: Orquesta las solicitudes al agente apropiado según el rol del usuario (cliente o repostero).
- **CustomerAgent**: Maneja consultas de clientes, incluyendo catálogo, citas, recomendaciones.
- **BakerAgent**: Maneja consultas de reposteros, incluyendo gestión de catálogo y citas.
- **AdvancedRAGAgent**: Implementa búsqueda híbrida y reranking con ChromaDB y Ollama embeddings.

### Herramientas

Las herramientas están registradas en `tools/registry.js` y se dividen en:

- **Customer Tools**: Funciones específicas para clientes (consultar catálogo, agendar citas, etc.)
- **Baker Tools**: Funciones específicas para reposteros (gestionar catálogo, consultar citas, etc.)
- **Common Tools**: Utilidades compartidas (caching, guardrails, normalización de texto, etc.)

## Dependencias Principales

- `express`: Servidor HTTP
- `mysql2`: Cliente MySQL
- `ollama`: Cliente para Ollama LLM
- `chromadb`: Cliente para ChromaDB (RAG)
- `pdf-parse`: Extracción de contenido de PDFs
- `dotenv`: Manejo de variables de entorno

## Notas

- Asegúrate de que Ollama y ChromaDB estén ejecutándose antes de iniciar el servidor
- El chatbot comparte la base de datos MySQL con el resto del sistema
