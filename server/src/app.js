const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();
const errorHandler = require('./middleware/errorHandler');
const { askChatbot, streamChatbot } = require('./controllers/chat.controller');
const chatRoutes = require('./routes/chat.routes');
const { authLimiter, registerLimiter, chatLimiter, apiLimiter } = require('./middleware/rateLimiter');
const sanitizeMiddleware = require('./middleware/sanitize');
const { auditLogger } = require('./middleware/auditLogger');
const { advancedSecurity } = require('./middleware/securityAdvanced');
const { clientChatGuard } = require('./middleware/clientChatGuard');


const app = express();

// Configurar trust proxy para nginx (solo confiar en el primer proxy)
app.set('trust proxy', 1);

// Security headers con Helmet
app.use(helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "https://fonts.googleapis.com"],
      scriptSrcAttr: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://unspoken-resurrect-bountiful.ngrok-free.dev", "http://127.0.0.1:5005"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: { policy: "require-corp" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" }
}));

// Desactivar header X-Powered-By
disablePoweredBy = (req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
};
app.use(disablePoweredBy);

// Seguridad avanzada con detección de VPN, fingerprinting y WAF
// Temporalmente desactivado debido a falsos positivos que bloquean peticiones legítimas
// app.use(advancedSecurity);

// CORS restrictivo - solo permitir orígenes específicos
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://unspoken-resurrect-bountiful.ngrok-free.dev'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS no permitido para este origen'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Sanitización global de inputs para prevenir SQLi y XSS
app.use(sanitizeMiddleware);

// Logging de auditoría para seguridad
app.use(auditLogger);

// Rate limiting general para API
app.use('/api/', apiLimiter);

// Rutas con rate limiting específico
app.use('/api/auth/login', authLimiter, require('./routes/auth.routes'));
app.use('/api/auth/register', registerLimiter, require('./routes/auth.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/categories', require('./routes/categories.routes'));
app.use('/api/cakes', require('./routes/cakes.routes'));
app.use('/api/bakers', require('./routes/bakers.routes'));
app.use('/api/appointments', require('./routes/appointments.routes'));
// Aplicar guardrail específico para clientes (no afecta a reposteros)
app.use('/api/chat', clientChatGuard, chatLimiter, chatRoutes);
app.post('/api/chat/stream', clientChatGuard, streamChatbot);

// Ruta base
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a la API de Danhee' });
});

// Manejo de errores
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  // Control opcional del microservicio Python RAG (deshabilitado por defecto)
  let pythonProcess = null;
  if (process.env.START_RAG === 'true') {
    console.log("🐍 Iniciando microservicio Python RAG en app.py...");
    pythonProcess = spawn("python", ["rag/app.py"], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8"
      }
    });

    pythonProcess.on("error", (err) => {
      console.error("❌ Error al iniciar el microservicio Python RAG:", err.message);
      console.error("Asegúrate de tener Python instalado y en tu variable de entorno PATH.");
    });

    pythonProcess.on("close", (code) => {
      console.log(`🐍 Microservicio Python RAG finalizó con código: ${code}`);
    });
  } else {
    console.log("🐍 Microservicio Python RAG deshabilitado (START_RAG !== 'true')");
  }

  // Limpieza de procesos huérfanos al apagar la aplicación
  const cleanup = () => {
    console.log("🧹 Cerrando microservicio Python RAG...");
    if (pythonProcess) {
      pythonProcess.kill("SIGINT");
    }
    process.exit();
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
});
