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

const getSecuritySummary = () => {
  const blocks = clearExpiredBlocks();
  const lines = fs.existsSync(eventsFilePath) ? fs.readFileSync(eventsFilePath, 'utf8').trim().split('\n').filter(Boolean) : [];
  const events = lines.slice(-100).map((line) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      return null;
    }
  }).filter(Boolean);

  return {
    blockedIps: Object.keys(blocks).length,
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
