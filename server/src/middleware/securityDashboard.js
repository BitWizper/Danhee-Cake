const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../logs');
const blockFilePath = path.join(dataDir, 'blocked-ips.json');
const eventsFilePath = path.join(dataDir, 'security-events.log');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const readJsonFile = (filePath, fallback) => {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

const writeJsonFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const getBlockedIPs = () => readJsonFile(blockFilePath, {});
const saveBlockedIPs = (data) => writeJsonFile(blockFilePath, data);

const persistBlock = (ip, durationMinutes, reason) => {
  const now = Date.now();
  const expiresAt = now + durationMinutes * 60 * 1000;
  const blocks = getBlockedIPs();
  blocks[ip] = { expiresAt, reason, blockedAt: new Date(now).toISOString() };
  saveBlockedIPs(blocks);
};

const clearExpiredBlocks = () => {
  const blocks = getBlockedIPs();
  const now = Date.now();
  const active = {};

  for (const [ip, value] of Object.entries(blocks)) {
    if (value.expiresAt > now) {
      active[ip] = value;
    }
  }

  if (Object.keys(active).length !== Object.keys(blocks).length) {
    saveBlockedIPs(active);
  }

  return active;
};

const isPersistedBlocked = (ip) => {
  const activeBlocks = clearExpiredBlocks();
  return Boolean(activeBlocks[ip]);
};

// Función para ofuscar IPs (proteger privacidad en logs de seguridad)
const obfuscateIP = (ip) => {
  if (!ip) return 'unknown';
  // Ofuscar los últimos octetos de IPv4 o últimos segmentos de IPv6
  if (ip.includes(':')) {
    // IPv6: ofuscar últimos 4 segmentos
    const parts = ip.split(':');
    if (parts.length >= 4) {
      return parts.slice(0, 4).join(':') + ':' + '****'.repeat(parts.length - 4);
    }
    return ip.substring(0, ip.length / 2) + '****';
  }
  // IPv4: ofuscar últimos 2 octetos
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return '***.***.***.***';
};

const getSecuritySummary = () => {
  const blocks = clearExpiredBlocks();
  const lines = fs.existsSync(eventsFilePath) ? fs.readFileSync(eventsFilePath, 'utf8').trim().split('\n').filter(Boolean) : [];
  const events = lines.slice(-100).map((line) => {
    try {
      const event = JSON.parse(line);
      // Ofuscar IP en el evento para proteger privacidad
      if (event.ip) {
        event.ip = obfuscateIP(event.ip);
      }
      return event;
    } catch (error) {
      return null;
    }
  }).filter(Boolean);

  return {
    blockedIps: Object.keys(blocks).length,
    // Ofuscar IPs en la lista de bloqueados
    blockedIpList: Object.entries(blocks).map(([ip, details]) => ({
      ip: obfuscateIP(ip),
      ...details
    })),
    recentEvents: events,
    eventCount: events.length
  };
};

module.exports = {
  persistBlock,
  clearExpiredBlocks,
  isPersistedBlocked,
  getSecuritySummary,
  getBlockedIPs
};

// Limpiar entradas expiradas al iniciar el servidor (después de que todas las funciones estén definidas)
clearExpiredBlocks();
