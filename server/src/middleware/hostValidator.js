const { logSecurityEvent } = require('./auditLogger');
const { getClientIP } = require('./clientIp');

const allowedHosts = (process.env.PUBLIC_HOST || 'unspoken-resurrect-bountiful.ngrok-free.dev')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

const normalizeHeader = (value) => {
  if (!value) return '';
  return String(value).split(',')[0].trim().toLowerCase();
};

const isValidHost = (req) => {
  const hostHeader = normalizeHeader(req.headers.host);
  const forwardedHost = normalizeHeader(req.headers['x-forwarded-host']);
  const forwarded = normalizeHeader(req.headers['forwarded']);
  const hostname = normalizeHeader(req.hostname);

  if (allowedHosts.includes(hostHeader) || allowedHosts.includes(forwardedHost) || allowedHosts.includes(hostname)) {
    return true;
  }

  // Some proxies include the original host in the Forwarded header
  if (forwarded.includes('host=')) {
    const parsed = forwarded.split(';').find((part) => part.trim().startsWith('host='));
    if (parsed) {
      const hostValue = parsed.split('=')[1]?.replace(/"/g, '').trim().toLowerCase();
      if (allowedHosts.includes(hostValue)) {
        return true;
      }
    }
  }

  return false;
};

const validateHostHeader = (req, res, next) => {
  if (isValidHost(req)) {
    return next();
  }

  const attemptedHost = normalizeHeader(req.headers.host) || normalizeHeader(req.headers['x-forwarded-host']) || normalizeHeader(req.headers['forwarded']);
  logSecurityEvent('INVALID_HOST_HEADER', {
    attemptedHost,
    path: req.originalUrl,
    method: req.method,
    ip: getClientIP(req)
  });

  return res.status(403).json({
    success: false,
    error: 'HOST_NOT_ALLOWED',
    message: 'Host no autorizado. La solicitud debe usar el dominio público permitido.'
  });
};

module.exports = { validateHostHeader };
