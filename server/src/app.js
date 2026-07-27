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

// Validación de tipos de datos en request body para prevenir NoSQL injection
const validateRequestBody = (req, res, next) => {
  const body = req.body;

  // Si no hay body (como en solicitudes GET), continuar
  if (!body || typeof body !== 'object') {
    return next();
  }

  // Función para validar que un valor sea string y no objeto/array
  const validateString = (value, fieldName) => {
    if (value !== null && value !== undefined) {
      if (typeof value !== 'string') {
        return false;
      }
      // Verificar que no sea un string que parece un objeto JSON
      if (value.startsWith('{') || value.startsWith('[') || value.includes('$')) {
        return false;
      }
    }
    return true;
  };

  // Validar campos comunes de autenticación
  if (body.email && !validateString(body.email, 'email')) {
    return res.status(400).json({ success: false, message: 'El campo email debe ser una cadena de texto válida.' });
  }
  if (body.username && !validateString(body.username, 'username')) {
    return res.status(400).json({ success: false, message: 'El campo username debe ser una cadena de texto válida.' });
  }
  if (body.password && !validateString(body.password, 'password')) {
    return res.status(400).json({ success: false, message: 'El campo password debe ser una cadena de texto válida.' });
  }
  if (body.name && !validateString(body.name, 'name')) {
    return res.status(400).json({ success: false, message: 'El campo name debe ser una cadena de texto válida.' });
  }

  next();
};

// Sanitización de parámetros query para prevenir SQLi en GET
const sanitizeQueryParams = (req, res, next) => {
  const sanitizeQueryValue = (value) => {
    if (typeof value === 'string') {
      return value
        .replace(/['";\\]/g, '')
        .replace(/--/g, '')
        .replace(/\/\*/g, '')
        .replace(/\*\//g, '')
        .replace(/@@/g, '')
        .trim()
        .substring(0, 100);
    }
    return value;
  };

  for (const key in req.query) {
    req.query[key] = sanitizeQueryValue(req.query[key]);
  }

  next();
};

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static('uploads'));
app.use(validateRequestBody);
app.use(sanitizeQueryParams);

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
