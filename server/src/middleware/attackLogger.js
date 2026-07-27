const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../../logs/security-events.log');
const logDir = path.dirname(logFilePath);

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const getClientIP = (req) => {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
};

const logAttack = (req, reason, extra = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    ip: getClientIP(req),
    method: req.method,
    path: req.originalUrl || req.path || '',
    reason,
    ...extra
  };

  fs.appendFileSync(logFilePath, `${JSON.stringify(entry)}\n`);
};

module.exports = { logAttack };
