const fs = require('fs');
const path = require('path');
const { getClientIP } = require('./clientIp');

const logFilePath = path.join(__dirname, '../../logs/security-events.log');
const logDir = path.dirname(logFilePath);

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

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
