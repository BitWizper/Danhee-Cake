const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();
const errorHandler = require('./middleware/errorHandler');
const { askChatbot, streamChatbot } = require('./controllers/chat.controller');
const chatRoutes = require('./routes/chat.routes');
const { authLimiter, registerLimiter, chatLimiter, apiLimiter, methodLimiter, writeLimiter, readLimiter } = require('./middleware/rateLimiter');
const sanitizeMiddleware = require('./middleware/sanitize');
const { auditLogger } = require('./middleware/auditLogger');
const { advancedSecurity } = require('./middleware/securityAdvanced');
const { clientChatGuard } = require('./middleware/clientChatGuard');
const { httpSecurity, validateBodySize, preventClickjacking, preventMimeSniffing, preventXSS } = require('./middleware/httpSecurity');
const { ipBlocker, attackDetector, recordFailedAttempt, recordSuccessfulAttempt } = require('./middleware/ipBlocker');
const methodBlocker = require('./middleware/methodBlocker');
const sqlInjectionBlocker = require('./middleware/sqlInjectionBlocker');
const { validateAllParameters } = require('./middleware/parameterValidator');
const { apiGuard } = require('./middleware/apiGuard');
const { apiFuzzingGuard } = require('./middleware/apiFuzzingGuard');
const { logAttack } = require('./middleware/attackLogger');
const { getSecuritySummary } = require('./middleware/securityDashboard');
const { validateHostHeader } = require('./middleware/hostValidator');
const browserOriginGuard = require('./middleware/browserOriginGuard');


const app = express();

// Configurar confianza en proxies para que Express use X-Forwarded-* correctamente
// Esto permite detectar la IP real del cliente incluso detrás de ngrok y otros proxies.
app.set('trust proxy', true);

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
      baseUri: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://snitch-wing-riddance.ngrok-free.dev"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
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
  crossOriginResourcePolicy: { policy: "same-origin" },
  // Headers adicionales de seguridad
  xDnsPrefetchControl: { allow: false },
  xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
  // No revelar información del servidor
  hidePoweredBy: true
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

// Bloqueo de rutas sensibles y archivos de configuración
app.use((req, res, next) => {
  const suspiciousPath = req.originalUrl || req.url || '';
  const sensitivePatterns = [/\/\.env/i, /\/\.git/i, /\/phpmyadmin/i, /\/wp-admin/i, /\/config\.(php|json|js)/i, /\/backup/i, /\/logs/i, /\\/i];
  if (sensitivePatterns.some((pattern) => pattern.test(suspiciousPath))) {
    return res.status(404).json({ success: false, error_code: 'NOT_FOUND', message: 'Recurso no encontrado' });
  }
  next();
});

// CORS restrictivo - solo permitir orígenes específicos
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://snitch-wing-riddance.ngrok-free.dev'
];

app.use(cors({
  origin: function(origin, callback) {
    // Permitir solicitudes sin origin (como mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    // Verificar si el origen está en la lista permitida
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error(`[CORS] Origen no permitido: ${origin}`);
      callback(new Error('CORS no permitido para este origen'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // 24 horas de caché para preflight requests
  optionsSuccessStatus: 204 // Responder con 204 para OPTIONS exitosos
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

// Rate limiting de auth ANTES del body parser para contar incluso si el JSON es inválido
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', registerLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/uploads', express.static('uploads'));

// Middleware de seguridad HTTP
app.use(httpSecurity);
app.use(validateBodySize);
app.use(preventClickjacking);
app.use(preventMimeSniffing);
app.use(preventXSS);

app.use('/api', validateAllParameters);
app.use('/api', apiGuard);
app.use('/api', apiFuzzingGuard);
app.use((req, res, next) => {
  res.on('finish', () => {
    const status = res.statusCode || 500;
    if (status >= 400) {
      logAttack(req, 'request_failed', { status });
    }
  });
  next();
});
app.use(sanitizeQueryParams);

// Rechazar temprano cualquier intento de modificar o crear recursos mediante APIs maliciosas
app.use('/api', (req, res, next) => {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  const suspiciousRedirectParams = ['redirect', 'next', 'url', 'returnUrl', 'return_to'];
  if (mutatingMethods.includes(req.method?.toUpperCase())) {
    const suspiciousPatterns = [/(select|insert|update|delete|drop|union|exec|script)/i, /<script|javascript:|on\w+=/i, /\$(where|ne|gt|lt|regex|in|nin|or|and)\b/i];
    const rawInput = JSON.stringify(req.body || {}) + JSON.stringify(req.query || {}) + JSON.stringify(req.params || {});
    if (suspiciousPatterns.some((pattern) => pattern.test(rawInput))) {
      console.log(`[SECURITY] Bloqueo preventivo de mutación maliciosa en ${req.originalUrl}`);
      return res.status(400).json({ success: false, error_code: 'MALICIOUS_MUTATION_BLOCKED', message: 'Operación bloqueada por seguridad' });
    }
  }

  for (const paramName of suspiciousRedirectParams) {
    const value = req.query?.[paramName] || req.body?.[paramName];
    if (typeof value === 'string' && /^(https?:)?\/\//i.test(value)) {
      return res.status(400).json({ success: false, error_code: 'OPEN_REDIRECT_BLOCKED', message: 'Redirección externa bloqueada' });
    }
  }

  next();
});

// ============================================================
// BLOQUEO DE MÉTODOS HTTP PELIGROSOS Y DETECCIÓN DE SQLi
// ============================================================
app.use(methodBlocker);
app.use(sqlInjectionBlocker);

// Sanitización global de inputs para prevenir SQLi y XSS
app.use(sanitizeMiddleware);

// Logging de auditoría para seguridad
app.use(auditLogger);

// Rate limiting general para API
app.use('/api/', apiLimiter);
app.use('/api/', methodLimiter);
app.use('/api/', writeLimiter);
app.use('/api/', readLimiter);

// Middleware de bloqueo por IP para todas las rutas de API públicas
app.use('/api', validateHostHeader, browserOriginGuard, ipBlocker);

// Middleware de detección de ataques para todas las rutas de API
app.use('/api', attackDetector);

// También proteger rutas top-level adicionales si existen
app.use('/chat', validateHostHeader, browserOriginGuard, ipBlocker, attackDetector);
app.use('/admin', validateHostHeader, browserOriginGuard, ipBlocker, attackDetector);

// Rutas (rate limiting específico aplicado en archivos de rutas)
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/categories', require('./routes/categories.routes'));
app.use('/api/cakes', require('./routes/cakes.routes'));
app.use('/api/bakers', require('./routes/bakers.routes'));
app.use('/api/appointments', require('./routes/appointments.routes'));
app.use('/api/payments', require('./routes/payments.routes'));
// Aplicar guardrail específico para clientes (no afecta a reposteros)
app.use('/api/chat', clientChatGuard, chatLimiter, chatRoutes);
app.post('/api/chat/stream', clientChatGuard, streamChatbot);

// Ruta base
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a la API de Danhee' });
});

app.get('/api/security/alerts', (req, res) => {
  res.json({
    success: true,
    data: getSecuritySummary()
  });
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
