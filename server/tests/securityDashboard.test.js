const test = require('node:test');
const assert = require('node:assert/strict');
const { persistBlock, getSecuritySummary } = require('../src/middleware/securityDashboard');

test('persists blocked IP data and exposes a security summary', () => {
  const ip = '203.0.113.77';
  persistBlock(ip, 1, 'rate_limit');
  const summary = getSecuritySummary();

  assert.equal(summary.blockedIps >= 1, true);
  assert.equal(Array.isArray(summary.recentEvents), true);
});
