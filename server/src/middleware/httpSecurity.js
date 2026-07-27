// middleware/httpSecurity.js
// Middleware de seguridad HTTP para prevenir ataques comunes

const { logSecurityEvent } = require('./auditLogger');

// Configuración
const HTTP_SECURITY_CONFIG = {
  maxUrlLength: 2000,
  maxHeaderLength: 8192,
  maxBodySize: '1mb',
  blockedUserAgents: [
    /sqlmap/i,
    /nmap/i,
    /nikto/i,
    /burpcollaborator/i,
    /acunetix/i,
    /w3af/i,
    /hydra/i,
    /metasploit/i,
    /openvas/i,
    /skipfish/i,
    /dirbuster/i,
    /wpscan/i,
    /arachni/i,
    /webscarab/i,
    /grabber/i,
    /havij/i,
    /pangolin/i,
    /bbscan/i,
    /nmap scripting engine/i,
    // curl, wget, postman, insomnia removidos - son herramientas legítimas de desarrollo/testing
    /libwww-perl/i,
    /java/i,
    /jakarta/i,
    /go-http-client/i
  ],
  blockedPaths: [
    /\.\./, // Path traversal
    /%2e%2e/i, // Path traversal encoded
    /%5c/i, // Backslash encoded
    /%00/i, // Null byte
    /\/etc\//i, // Linux system files
    /\/proc\//i, // Linux proc filesystem
    /c:\\windows/i, // Windows system files
    /\\windows\\system32/i, // Windows system32
    /\.env/i, // Environment files
    /\.git/i, // Git files
    /config\.php/i,
    /wp-config/i,
    /\.htaccess/i,
    /\.htpasswd/i
  ],
  blockedExtensions: [
    /\.php$/i,
    /\.jsp$/i,
    /\.asp$/i,
    /\.aspx$/i,
    /\.sh$/i,
    /\.bash$/i,
    /\.exe$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.ps1$/i,
    /\.vbs$/i,
    /\.jsf$/i,
    /\.jspx$/i
  ]
};

// Función para detectar User-Agent malicioso
const isMaliciousUserAgent = (userAgent) => {
  if (!userAgent) return true; // Bloquear sin User-Agent
  
  for (const pattern of HTTP_SECURITY_CONFIG.blockedUserAgents) {
    if (pattern.test(userAgent)) {
      return true;
    }
  }
  
  return false;
};

// Función para detectar path traversal
const hasPathTraversal = (path) => {
  for (const pattern of HTTP_SECURITY_CONFIG.blockedPaths) {
    if (pattern.test(path)) {
      return true;
    }
  }
  return false;
};

// Función para detectar extensiones peligrosas
const hasDangerousExtension = (path) => {
  for (const pattern of HTTP_SECURITY_CONFIG.blockedExtensions) {
    if (pattern.test(path)) {
      return true;
    }
  }
  return false;
};

// Middleware principal de seguridad HTTP
const httpSecurity = (req, res, next) => {
  const userAgent = req.headers['user-agent'];
  const ip = req.ip;
  
  // 1. Validar longitud de URL
  if (req.url.length > HTTP_SECURITY_CONFIG.maxUrlLength) {
    logSecurityEvent('URL_TOO_LONG', {
      ip,
      userAgent,
      urlLength: req.url.length,
      path: req.path
    });
    return res.status(414).json({
      error: 'URL too long',
      message: 'La URL excede el tamaño máximo permitido'
    });
  }
  
  // 2. Validar longitud de headers
  for (const [headerName, headerValue] of Object.entries(req.headers)) {
    if (typeof headerValue === 'string' && headerValue.length > HTTP_SECURITY_CONFIG.maxHeaderLength) {
      logSecurityEvent('HEADER_TOO_LONG', {
        ip,
        userAgent,
        headerName,
        headerLength: headerValue.length
      });
      return res.status(431).json({
        error: 'Request header too large',
        message: 'El header excede el tamaño máximo permitido'
      });
    }
  }
  
  // 3. Detectar User-Agent malicioso
  if (isMaliciousUserAgent(userAgent)) {
    logSecurityEvent('MALICIOUS_USER_AGENT', {
      ip,
      userAgent,
      path: req.path
    });
    return res.status(403).json({
      error: 'Access denied',
      message: 'User-Agent no permitido'
    });
  }
  
  // 4. Detectar path traversal en URL
  if (hasPathTraversal(req.url)) {
    logSecurityEvent('PATH_TRAVERSAL_DETECTED', {
      ip,
      userAgent,
      url: req.url
    });
    return res.status(403).json({
      error: 'Access denied',
      message: 'Path traversal detectado'
    });
  }
  
  // 5. Detectar extensiones peligrosas en URL
  if (hasDangerousExtension(req.url)) {
    logSecurityEvent('DANGEROUS_EXTENSION_DETECTED', {
      ip,
      userAgent,
      url: req.url
    });
    return res.status(403).json({
      error: 'Access denied',
      message: 'Extensión de archivo no permitida'
    });
  }
  
  // 6. Validar método HTTP
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
  if (!allowedMethods.includes(req.method)) {
    logSecurityEvent('INVALID_HTTP_METHOD', {
      ip,
      userAgent,
      method: req.method
    });
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Método HTTP no permitido'
    });
  }
  
  // 7. Detectar request smuggling (headers duplicados o conflictivos)
  const contentLength = req.headers['content-length'];
  const transferEncoding = req.headers['transfer-encoding'];
  
  if (contentLength && transferEncoding) {
    logSecurityEvent('REQUEST_SMUGGLING_ATTEMPT', {
      ip,
      userAgent,
      contentLength,
      transferEncoding
    });
    return res.status(400).json({
      error: 'Bad request',
      message: 'Headers conflictivos detectados'
    });
  }
  
  // 8. Validar Content-Type para métodos que requieren body
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const contentType = req.headers['content-type'];
    const allowedContentTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain'
    ];
    
    if (contentType && !allowedContentTypes.some(type => contentType.includes(type))) {
      logSecurityEvent('INVALID_CONTENT_TYPE', {
        ip,
        userAgent,
        contentType
      });
      return res.status(415).json({
        error: 'Unsupported media type',
        message: 'Content-Type no soportado'
      });
    }
  }
  
  // 9. Detectar caracteres nulos en parámetros
  const checkForNullBytes = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string' && obj[key].includes('\x00')) {
        return true;
      }
    }
    return false;
  };
  
  if (checkForNullBytes(req.query) || checkForNullBytes(req.params) || checkForNullBytes(req.body)) {
    logSecurityEvent('NULL_BYTE_DETECTED', {
      ip,
      userAgent,
      path: req.path
    });
    return res.status(400).json({
      error: 'Bad request',
      message: 'Caracteres nulos no permitidos'
    });
  }
  
  next();
};

// Middleware para validar tamaño de body
const validateBodySize = (req, res, next) => {
  const contentLength = req.headers['content-length'];
  const maxSize = 1 * 1024 * 1024; // 1MB
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    logSecurityEvent('BODY_TOO_LARGE', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      contentLength: parseInt(contentLength),
      maxSize
    });
    return res.status(413).json({
      error: 'Payload too large',
      message: 'El cuerpo de la solicitud excede el tamaño máximo permitido (1MB)'
    });
  }
  
  next();
};

// Middleware para prevenir clickjacking adicional
const preventClickjacking = (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
};

// Middleware para prevenir MIME sniffing
const preventMimeSniffing = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

// Middleware para prevenir cross-site scripting
const preventXSS = (req, res, next) => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};

module.exports = {
  httpSecurity,
  validateBodySize,
  preventClickjacking,
  preventMimeSniffing,
  preventXSS,
  HTTP_SECURITY_CONFIG
};
