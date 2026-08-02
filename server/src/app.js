const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Importar middlewares de seguridad
const { securityLogger, getSecurityStats } = require('./middleware/securityLogger');
const { fileUploadValidator } = require('./middleware/fileUploadValidator');
const { ipRateLimiter, apiRateLimiter, getRateLimitStats } = require('./middleware/ipRateLimiter');
const { bruteForceProtection, loginBruteForceProtection, getBruteForceStats } = require('./middleware/bruteForceProtection');
const { inputSanitizer } = require('./middleware/inputSanitizer');
const httpsEnforcer = require('./middleware/httpsEnforcer');
let rootPackage = {};
try {
  rootPackage = require(path.join(__dirname, '..', 'package.json'));
} catch (e) {
  console.warn('No se encontró package.json en la ruta esperada:', e.message);
}
require('dotenv').config({
  path: process.env.DOTENV_PATH || path.resolve(__dirname, '..', '.env')
});

const requireEnv = (name, fallback = undefined) => {
  const value = process.env[name] || fallback;
  if (!value) {
    console.warn(`[ENV] Missing ${name}; using fallback`);
  }
  return value;
};

const JWT_SECRET = requireEnv('JWT_SECRET', 'change-me-in-production');
const REFRESH_TOKEN_SECRET = requireEnv('REFRESH_TOKEN_SECRET', '');

// Validación estricta de secrets en producción - CRASH si son inválidos
if (process.env.NODE_ENV === 'production') {
  if (!JWT_SECRET || JWT_SECRET === 'change-me-in-production' || JWT_SECRET.length < 32) {
    console.error('[CRITICAL SECURITY] JWT_SECRET is invalid, placeholder, or too short in production. Server will crash to prevent security breach.');
    console.error('[CRITICAL SECURITY] Set a strong JWT_SECRET (min 32 chars) in server/.env or docker.env before deploying.');
    process.exit(1);
  }
  if (!REFRESH_TOKEN_SECRET || REFRESH_TOKEN_SECRET.length < 32) {
    console.error('[CRITICAL SECURITY] REFRESH_TOKEN_SECRET is missing or too short in production. Server will crash to prevent security breach.');
    console.error('[CRITICAL SECURITY] Set a strong REFRESH_TOKEN_SECRET (min 32 chars) in server/.env or docker.env before deploying.');
    process.exit(1);
  }
  if (REFRESH_TOKEN_SECRET === JWT_SECRET) {
    console.error('[CRITICAL SECURITY] REFRESH_TOKEN_SECRET must be different from JWT_SECRET in production. Server will crash to prevent security breach.');
    process.exit(1);
  }
  console.log('[SECURITY] Production secrets validated successfully.');
} else {
  // En desarrollo, solo advertir
  if (JWT_SECRET === 'change-me-in-production') {
    console.warn('[ENV] JWT_SECRET is using a placeholder value. Set a strong secret in your deployment environment.');
  }
  if (!REFRESH_TOKEN_SECRET) {
    console.warn('[ENV] REFRESH_TOKEN_SECRET is missing. Set a strong refresh token secret in production or configure a secret manager.');
  }
  if (REFRESH_TOKEN_SECRET === JWT_SECRET) {
    console.warn('[ENV] REFRESH_TOKEN_SECRET must be different from JWT_SECRET in production.');
  }
}

process.env.JWT_SECRET = JWT_SECRET;
process.env.REFRESH_TOKEN_SECRET = REFRESH_TOKEN_SECRET || JWT_SECRET;
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
const requestGuard = require('./middleware/requestGuard');
const { authMiddleware, authorize } = require('./middleware/auth');
const { csrfProtection, csrfTokenGenerator } = require('./middleware/csrfProtection');
const { validateCookieFingerprint, detectCookieTampering, requireReauthOnFingerprintMismatch } = require('./middleware/cookieSecurity');


const app = express();

// Desactivar header X-Powered-By a nivel de Express
app.disable('x-powered-by');

// Configurar confianza en proxies de forma estricta para evitar spoofing de IP.
// Solo aceptamos X-Forwarded-* cuando provienen de proxies de confianza explícitos.
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Bloquear accesos sensibles y manejar OPTIONS de forma temprana
// Cookie parser para leer cookies httpOnly
app.use(cookieParser());

// Detectar manipulación de cookies antes de procesar cualquier request
app.use(detectCookieTampering);

// Validar fingerprint del cliente para prevenir robo de sesiones
app.use(validateCookieFingerprint);

// Requerir re-autenticación en acciones sensibles cuando hay fingerprint mismatch
app.use(requireReauthOnFingerprintMismatch);

app.use(requestGuard);

// Forzar HTTPS en producción
app.use(httpsEnforcer);

// Logging de seguridad
app.use(securityLogger);

// Rate limiting por IP (global) - Reactivado con límites conservadores
app.use(ipRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 200 // 200 solicitudes por minuto (límite generoso)
}));

// Sanitización de inputs
app.use(inputSanitizer({ strict: true }));

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
      connectSrc: ["'self'", ...(process.env.CSP_CONNECT_SRC ? process.env.CSP_CONNECT_SRC.split(',') : []), ...(process.env.NODE_ENV !== 'production' ? ["https://*.trycloudflare.com"] : [])],
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
const disablePoweredBy = (req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
};
app.use(disablePoweredBy);

// Seguridad avanzada con detección de VPN, fingerprinting y WAF
// Reactivado con configuración conservadora para reducir falsos positivos
app.use(advancedSecurity);

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
  'https://danhee-cake.vercel.app',
  'https://danhee-cake-sage.vercel.app',
  'https://danhee-cake-3zzal4zyl-bitwizpers-projects.vercel.app',
  'https://danhee-cake-qvmrsik4m-bitwizpers-projects.vercel.app',
  'https://danhee-cake-3uix5gn6p-bitwizpers-projects.vercel.app',
  'https://broken-defined-physiology-pirates.trycloudflare.com',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
];

const corsOptions = {
  origin: function(origin, callback) {
    console.log(`[CORS] Request from origin: ${origin}`);
    console.log(`[CORS] NODE_ENV: ${process.env.NODE_ENV}`);
    
    // Permitir requests sin origin (curl, healthchecks, server-to-server, túnel Cloudflare)
    // Esto es necesario porque el túnel puede no enviar header Origin en algunos casos
    if (!origin) {
      console.log('[CORS] No origin present, allowing (curl/healthcheck/tunnel)');
      return callback(null, true);
    }
    
    // Verificar si el origen está en la allowlist
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log(`[CORS] Origin ${origin} is allowed`);
      return callback(null, true);
    }
    
    // En desarrollo, ser más permisivo con orígenes de túneles Cloudflare
    if (process.env.NODE_ENV !== 'production' && (origin.includes('trycloudflare.com') || origin.includes('localhost'))) {
      console.log(`[CORS] Allowing development origin: ${origin}`);
      return callback(null, true);
    }
    
    // Rechazar origen no permitido con error específico
    console.log(`[CORS] Origin ${origin} is NOT allowed`);
    const error = new Error('CORS no permitido');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'Set-Cookie'],
  maxAge: 86400, // 24 horas de caché para preflight requests
  optionsSuccessStatus: 204 // Responder con 204 para OPTIONS exitosos
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Browser origin guard para prevenir requests desde navegadores no autorizados
app.use(browserOriginGuard);

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

  // Rechazar arrays en query params (ej: offset[]=1&offset[]=2)
  for (const key in req.query) {
    if (Array.isArray(req.query[key])) {
      console.log(`[SECURITY] Array parameter detected and rejected: ${key}`);
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PARAMETER',
        message: 'Los parámetros de consulta no pueden ser arrays.'
      });
    }
    req.query[key] = sanitizeQueryValue(req.query[key]);
  }

  next();
};

// Rate limiting de auth ANTES del body parser para contar incluso si el JSON es inválido
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', registerLimiter);

// Brute force protection para auth
app.use('/api/auth/login', loginBruteForceProtection);
app.use('/api/auth/register', bruteForceProtection);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Endpoint seguro para servir imágenes con token temporal
app.get('/api/images/:filename', (req, res) => {
  const { filename } = req.params;
  const { token, expires } = req.query;
  
  // Validar parámetros
  if (!filename || !token || !expires) {
    return res.status(400).json({ success: false, message: 'Parámetros inválidos' });
  }
  
  // Validar que el token no haya expirado
  const currentTime = Date.now();
  if (parseInt(expires) < currentTime) {
    return res.status(403).json({ success: false, message: 'Token expirado' });
  }
  
  // Validar la firma del token
  const tokenData = `${filename}|${expires}`;
  
  if (!process.env.JWT_SECRET) {
    console.error('[Security] JWT_SECRET no está definido para validar token de imagen');
    return res.status(500).json({ success: false, message: 'Error de configuración del servidor' });
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(tokenData)
    .digest('hex');
  
  if (token !== expectedSignature) {
    console.warn('[Security] Token inválido para imagen:', filename);
    return res.status(403).json({ success: false, message: 'Token inválido' });
  }
  
  // Validar el nombre del archivo para prevenir path traversal
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (sanitizedFilename !== filename) {
    return res.status(400).json({ success: false, message: 'Nombre de archivo inválido' });
  }
  
  // Construir ruta segura del archivo
  const filePath = path.join(__dirname, '..', 'uploads', sanitizedFilename);
  
  // Verificar que el archivo existe y está dentro del directorio uploads
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!filePath.startsWith(uploadsDir)) {
    return res.status(403).json({ success: false, message: 'Acceso denegado' });
  }
  
  // Servir el archivo si existe
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ success: false, message: 'Imagen no encontrada' });
    }
    
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('[Images] Error sirviendo imagen:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Error al servir imagen' });
        }
      }
    });
  });
});

// Mantener el endpoint estático para compatibilidad, pero con restricciones
app.use('/uploads', (req, res, next) => {
  // Solo permitir acceso si viene del mismo origen (prevenir hotlinking externo)
  const origin = req.headers.origin || req.headers.referer;
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://danhee-cake.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean);
  
  // Si no hay origin/referer o no está en la lista permitida, bloquear
  if (!origin || !allowedOrigins.some(allowed => origin.includes(allowed.replace(/^https?:\/\//, '')))) {
    return res.status(403).json({ success: false, message: 'Acceso no autorizado' });
  }
  
  next();
}, express.static('uploads'));

// Ruta para servir medios protegidos (p.ej. videos) desde `public` o `dist`.
// Requiere `X-MEDIA-KEY` header o query `?key=` con valor en env `MEDIA_KEY`,
// o bien un `Authorization: Bearer <token>` para peticiones autenticadas.
app.get('/protected-media/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  // Solo permitir carpetas específicas
  const allowed = ['public', 'dist', 'uploads'];
  if (!allowed.includes(folder)) return res.status(404).json({ success: false, message: 'Recurso no encontrado' });

  const key = req.get('X-MEDIA-KEY') || req.query.key;
  const auth = req.get('Authorization');

  // Validación mínima: MEDIA_KEY o Authorization presente
  if (!(key && process.env.MEDIA_KEY && key === process.env.MEDIA_KEY) && !(auth && auth.startsWith('Bearer '))) {
    return res.status(403).json({ success: false, message: 'Acceso denegado' });
  }

  const baseDir = path.join(__dirname, '..', '..', folder);
  const safePath = path.normalize(path.join(baseDir, filename));
  if (!safePath.startsWith(baseDir)) return res.status(400).json({ success: false, message: 'Ruta inválida' });

  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) return res.status(404).json({ success: false, message: 'Recurso no encontrado' });

    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    const stream = fs.createReadStream(safePath);
    stream.on('error', () => res.status(500).end());
    stream.pipe(res);
  });
});

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
      return res.status(400).json({ success: false, error_code: 'INVALID_REQUEST', message: 'Solicitud inválida.' });
    }
  }

  for (const paramName of suspiciousRedirectParams) {
    const value = req.query?.[paramName] || req.body?.[paramName];
    if (typeof value === 'string' && /^(https?:)?\/\//i.test(value)) {
      return res.status(400).json({ success: false, error_code: 'INVALID_REQUEST', message: 'Solicitud inválida.' });
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

// Rate limiting general para API (excluyendo chat que tiene su propio limiter)
app.use('/api/', apiLimiter);
app.use('/api/', methodLimiter);
app.use('/api/', writeLimiter);
app.use('/api/', readLimiter);

// Middleware de validación de host (menos agresivo que ipBlocker/attackDetector)
app.use('/api', validateHostHeader);
app.use('/chat', validateHostHeader);
app.use('/admin', validateHostHeader);

// Middleware de bloqueo por IP y detección de ataques - REACTIVADO con configuración conservadora
// Aplicado con configuración ajustada para reducir falsos positivos en el chat IA
app.use('/api', validateHostHeader, ipBlocker);
app.use('/api', attackDetector);
app.use('/chat', validateHostHeader, ipBlocker);
app.use('/chat', attackDetector);
app.use('/admin', validateHostHeader, ipBlocker, attackDetector);

// Rutas (rate limiting específico aplicado en archivos de rutas)
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/categories', require('./routes/categories.routes'));
app.use('/api/cakes', require('./routes/cakes.routes'));
app.use('/api/bakers', require('./routes/bakers.routes'));
app.use('/api/appointments', require('./routes/appointments.routes'));
app.use('/api/payments', require('./routes/payments.routes'));
// Endpoint de streaming específico para chat con rate limiting
app.post('/api/chat/stream', chatLimiter, clientChatGuard, streamChatbot);
// Aplicar guardrail específico para clientes (no afecta a reposteros)
app.use('/api/chat', clientChatGuard, chatRoutes);

// Ruta base
app.get('/', csrfTokenGenerator, (req, res) => {
  res.json({ message: 'Bienvenido a la API de Danhee' });
});

// Endpoint de estadísticas de seguridad (solo para administradores autenticados)
app.get('/api/admin/security-stats', authMiddleware, authorize('admin'), (req, res) => {
  try {
    const securityStats = getSecurityStats();
    const rateLimitStats = getRateLimitStats();
    const bruteForceStats = getBruteForceStats();
    
    res.json({
      success: true,
      data: {
        security: securityStats,
        rateLimiting: rateLimitStats,
        bruteForce: bruteForceStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching security stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching security statistics'
    });
  }
});

app.get('/health', (req, res) => {
  // No exponer información sensible en producción
  const isProduction = process.env.NODE_ENV === 'production';
  res.json({
    success: true,
    uptime: process.uptime(),
    ...(isProduction ? {} : {
      environment: process.env.NODE_ENV || 'development',
      version: rootPackage?.version || 'unknown',
      timestamp: new Date().toISOString()
    })
  });
});

app.get('/robots.txt', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://danhee-cake.vercel.app';
  res.type('text/plain').send([
    'User-agent: *',
    'Disallow: /api/',
    'Disallow: /server/',
    'Allow: /',
    '',
    `Sitemap: ${frontendUrl}/sitemap.xml`
  ].join('\n'));
});

app.get('/.well-known/security.txt', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://danhee-cake.vercel.app';
  res.type('text/plain').send([
    'Contact: mailto:security@danhee.com',
    'Preferred-Languages: es, en',
    `Canonical: ${frontendUrl}/.well-known/security.txt`,
    `Policy: ${frontendUrl}/security-policy.html`
  ].join('\n'));
});

app.get('/api/health', (req, res) => {
  // No exponer información sensible en producción
  const isProduction = process.env.NODE_ENV === 'production';
  res.json({
    success: true,
    uptime: process.uptime(),
    ...(isProduction ? {} : {
      environment: process.env.NODE_ENV || 'development',
      version: rootPackage?.version || 'unknown',
      timestamp: new Date().toISOString()
    })
  });
});

app.get('/api/security/alerts', authMiddleware, authorize('admin'), (req, res) => {
  // getSecuritySummary ya ofusca IPs automáticamente (obfuscateIP)
  res.json({
    success: true,
    data: getSecuritySummary()
  });
});

// Endpoint para gestionar IPs bloqueadas (solo admin)
app.get('/api/admin/blocked-ips', authMiddleware, authorize('admin'), (req, res) => {
  try {
    const { getIPStats, isIPBlocked, IP_BLOCKER_CONFIG } = require('./middleware/ipBlocker');
    const stats = {
      config: IP_BLOCKER_CONFIG,
      // Nota: getIPStats requiere una IP específica, así que devolvemos la configuración
      message: 'Use POST /api/admin/unblock-ip con { ip: "x.x.x.x" } para desbloquear una IP específica'
    };
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error obteniendo estadísticas de IPs' });
  }
});

app.post('/api/admin/unblock-ip', authMiddleware, authorize('admin'), (req, res) => {
  try {
    const { unblockIP } = require('./middleware/ipBlocker');
    const { ip } = req.body;
    
    if (!ip) {
      return res.status(400).json({ success: false, message: 'IP es requerida' });
    }
    
    unblockIP(ip);
    res.json({ success: true, message: `IP ${ip} desbloqueada correctamente` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error desbloqueando IP' });
  }
});

// Manejo de errores
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🤖 RAG service: ${process.env.RAG_SERVICE_URL || 'http://rag-service:5001'}`);
});
