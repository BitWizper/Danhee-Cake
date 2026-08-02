# Danhee Cake - Plataforma de Repostería Personalizada

Sistema completo de e-commerce para repostería personalizada con chatbot RAG impulsado por IA.

## 🏗️ Arquitectura

### Frontend (React + Vite)
- **Framework**: React 19 con Vite
- **Router**: React Router v7
- **Estilos**: CSS personalizado + sistema de diseño
- **UI Components**: Componentes modulares reutilizables
- **Testing**: Vitest + Testing Library

### Backend (Node.js + Express)
- **Framework**: Express.js
- **Base de datos**: MySQL 8.0
- **Autenticación**: JWT (access + refresh tokens)
- **Chat RAG**: Microservicio separado con ChromaDB + Ollama
- **Seguridad**: Helmet, CORS restrictivo, rate limiting, WAF

### Infraestructura
- **Frontend**: Vercel (SPA)
- **Backend**: Docker Compose (development/staging)
- **Túnel temporal**: Cloudflare Tunnel (development only)
- **Orquestación**: Docker Compose

## 🚀 Cómo correr el proyecto

### Prerrequisitos
- Node.js 20+
- Docker y Docker Compose
- Ollama (para el chatbot RAG)

### Desarrollo local

1. **Clonar el repositorio**
```bash
git clone <repo-url>
cd Danhee-Cake
```

2. **Configurar variables de entorno**
```bash
# Copiar archivo de ejemplo
cp server/.env.example server/.env
cp docker.env.example docker.env

# Editar las variables necesarias
# - JWT_SECRET y REFRESH_TOKEN_SECRET (secrets fuertes)
# - DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
# - RAG_SERVICE_SECRET
```

3. **Iniciar servicios con Docker**
```bash
docker compose up -d
```

Esto iniciará:
- Backend Node.js (puerto 4000 → 5000)
- Base de datos MySQL
- ChromaDB (para RAG)
- RAG Service (puerto 5001)
- Cloudflare Tunnel (URL temporal)
- Frontend (puerto 3000)

4. **Desarrollo frontend**
```bash
npm install
npm run dev
```

Frontend disponible en: `http://localhost:5173`

### Desarrollo sin Docker (opcional)

Si prefieres correr el backend directamente:

1. **Iniciar base de datos**
```bash
docker compose up database chromadb -d
```

2. **Configurar backend**
```bash
cd server
npm install
npm run dev
```

3. **Iniciar RAG service**
```bash
cd server/rag
npm install
npm run dev
```

## 📦 Manual de Despliegue

### Frontend (Vercel)

1. **Configurar variables de entorno en Vercel**
   - `VITE_BASE_URL`: URL del backend (ej: `https://tu-backend.com`)
   - `FRONTEND_URL`: URL del frontend (Vercel te la da)

2. **Desplegar**
```bash
npm run build
# Conectar repo a Vercel y desplegar
```

3. **Configurar dominio en backend CORS**
   - Agregar el dominio de Vercel a la allowlist en `server/src/app.js`

### Backend (Producción)

**Opción 1: VPS con dominio propio (recomendado)**
1. Configurar VPS con Docker
2. Copiar `docker-compose.yml` y archivos de configuración
3. Configurar `docker.env` con secrets de producción
4. Eliminar servicio `cloudflared` del compose
5. Configurar dominio y SSL (Let's Encrypt)
6. `docker compose up -d`

**Opción 2: Railway/Render/Fly**
1. Migrar configuración de Docker al servicio
2. Configurar variables de entorno en el servicio
3. Desplegar

**NO usar túneles efímeros en producción** (trycloudflare, ngrok, etc.)

### Base de datos

**En producción**: Usar servicio de base de datos gestionado (Clever Cloud, Railway, PlanetScale)
- Configurar SSL obligatorio
- Configurar whitelist de IPs
- Rotar credenciales regularmente

## 🔐 Seguridad

### Secrets Requeridos
- `JWT_SECRET`: Mínimo 32 caracteres, diferente de REFRESH_TOKEN_SECRET
- `REFRESH_TOKEN_SECRET`: Mínimo 32 caracteres
- `RAG_SERVICE_SECRET`: Secret para comunicación entre backend y RAG service
- `MYSQL_ROOT_PASSWORD`: Contraseña fuerte de MySQL

### Validaciones de Seguridad
- ✅ JWT con validación estricta en producción
- ✅ Rate limiting por IP y por usuario
- ✅ CORS restrictivo con allowlist
- ✅ Headers de seguridad (CSP, HSTS, X-Frame-Options)
- ✅ Sanitización de inputs y SQL injection blocking
- ✅ WAF avanzado con detección de VPN y fingerprinting
- ✅ Protección contra brute force

## 🧪 Testing

### Ejecutar pruebas
```bash
npm test              # Modo watch
npm test:run          # Ejecutar una vez
npm test:ui           # Interfaz visual
```

### Cobertura
```bash
npm test:run -- --coverage
```

## 📁 Estructura del Proyecto

```
Danhee-Cake/
├── src/                    # Frontend React
│   ├── components/         # Componentes UI
│   ├── pages/              # Páginas de la aplicación
│   ├── context/            # Contextos (Auth, Cart)
│   ├── utils/              # Utilidades
│   └── test/               # Pruebas
├── server/                 # Backend Node.js
│   ├── src/                # Código del backend
│   │   ├── controllers/    # Controladores
│   │   ├── middleware/     # Middlewares
│   │   ├── routes/         # Rutas API
│   │   └── config/         # Configuración
│   ├── rag/                # Microservicio RAG
│   │   ├── agents/         # Agentes AI
│   │   ├── tools/          # Herramientas del chatbot
│   │   └── db-config.js    # Configuración de DB para RAG
│   ├── .env                # Variables de entorno (no commit)
│   └── Dockerfile          # Docker del backend
├── docker-compose.yml     # Orquestación Docker
├── docker.env             # Variables Docker (no commit)
├── vercel.json            # Configuración Vercel
└── vitest.config.js       # Configuración de tests
```

## 🐛 Troubleshooting

### Problema: El backend no responde
- Verificar que `docker compose up -d` esté corriendo
- Verificar logs: `docker compose logs backend`
- Verificar que las variables de entorno estén configuradas

### Problema: El chatbot no funciona
- Verificar que Ollama esté corriendo: `ollama list`
- Verificar logs del RAG service: `docker compose logs rag-service`
- Verificar que ChromaDB esté accesible

### Problema: CORS errors
- Verificar que el dominio del frontend esté en la allowlist CORS
- Configurar `FRONTEND_URL` como variable de entorno

### Problema: Tests fallan
- Asegurar que las dependencias estén instaladas: `npm install`
- Verificar que Vitest esté configurado correctamente

## 📝 Notas Importantes

- **Nunca commit** archivos `.env` o `docker.env` con secrets reales
- **No usar túneles efímeros** en producción
- **Siempre validar** secrets antes de desplegar a producción
- **Usar SSL** en todas las conexiones de base de datos
- **Rotar credenciales** regularmente

## 🤝 Contribución

Este es un proyecto privado. Contactar al equipo de desarrollo para contribuciones.

## 📄 Licencia

Propiedad de Danhee Cake. Todos los derechos reservados.
