// Middleware para bloquear accesos a archivos sensibles y manejar OPTIONS de forma segura
module.exports = (req, res, next) => {
  const requestPath = req.originalUrl || req.url || '';

  // Responder OPTIONS antes de llegar a lógica de ruta/validación
  if (req.method === 'OPTIONS') {
    return res.status(204).set({
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }).end();
  }

  const blockedPatterns = [
    /\.env/i,
    /\.git/i,
    /docker-compose\.yml/i,
    /nginx\.conf/i,
    /package(-lock)?\.json/i,
    /Dockerfile/i,
    /README\.md/i,
    /\.htaccess/i,
    /\.htpasswd/i
  ];

  if (blockedPatterns.some((pattern) => pattern.test(requestPath))) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Recurso no encontrado'
    });
  }

  next();
};
