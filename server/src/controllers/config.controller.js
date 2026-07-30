const { logSecurityEvent } = require('../middleware/auditLogger');
const { getClientIP } = require('../middleware/clientIp');

/**
 * Endpoint seguro para obtener la configuración del API
 * Devuelve la URL base del backend para que el frontend pueda conectarse dinámicamente
 * 
 * Medidas de seguridad implementadas:
 * - Rate limiting (aplicado en middleware)
 * - Validación de origen (CORS)
 * - Solo método GET permitido
 * - No expone información sensible
 * - Logging de todas las solicitudes
 * - Validación de fingerprint del navegador (opcional)
 */
const getConfig = (req, res) => {
  try {
    // Obtener la URL base del servidor
    // Prioridad: X-Forwarded-Host (proxy) > Host header > localhost
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:4000';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const apiUrl = `${protocol}://${host}`;

    // Logging de seguridad para monitorear accesos
    logSecurityEvent('CONFIG_ACCESS', {
      ip: getClientIP(req),
      userAgent: req.headers['user-agent']?.substring(0, 200),
      origin: req.headers.origin,
      referer: req.headers.referer?.substring(0, 200),
      path: req.originalUrl
    });

    // Devolver solo la información necesaria
    res.json({
      success: true,
      data: {
        apiUrl,
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Config] Error al obtener configuración:', error);
    logSecurityEvent('CONFIG_ERROR', {
      error: error.message,
      ip: getClientIP(req),
      path: req.originalUrl
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Error al obtener configuración'
    });
  }
};

module.exports = { getConfig };
