/**
 * Middleware de Forzado de HTTPS
 * Redirige automáticamente solicitudes HTTP a HTTPS
 */

const httpsEnforcer = (req, res, next) => {
  // Solo forzar HTTPS en producción
  if (process.env.NODE_ENV === 'production') {
    // Verificar si la solicitud ya es HTTPS
    const isHTTPS = req.secure || 
                    req.headers['x-forwarded-proto'] === 'https' ||
                    req.headers['x-forwarded-ssl'] === 'on';
    
    // Si no es HTTPS y no es localhost, redirigir
    if (!isHTTPS && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1') {
      const httpsUrl = `https://${req.hostname}${req.originalUrl}`;
      
      return res.redirect(301, httpsUrl);
    }
  }
  
  // Agregar header HSTS si es HTTPS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
};

module.exports = httpsEnforcer;
