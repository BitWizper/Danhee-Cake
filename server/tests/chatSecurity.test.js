const test = require('node:test');
const assert = require('node:assert/strict');

(async () => {
  const { validateMessage, sanitizeMessageAdvanced } = await import('../../src/utils/chatSecurity.js');

  test('rejects script and encoded payloads in chat messages', () => {
    const scriptResult = validateMessage('<script>alert(1)</script>');
    assert.equal(scriptResult.valid, false);

    const encodedResult = validateMessage('x%3Cscript%3Ealert(1)%3C/script%3E');
    assert.equal(encodedResult.valid, false);
  });

  test('sanitizes dangerous chat content without breaking safe text', () => {
    const sanitized = sanitizeMessageAdvanced('Hola <b>mundo</b> <img src=x onerror=alert(1)>');
    assert.equal(sanitized.includes('<b>'), false);
    assert.equal(sanitized.includes('onerror'), false);
    assert.match(sanitized, /Hola/);
  });
})();
