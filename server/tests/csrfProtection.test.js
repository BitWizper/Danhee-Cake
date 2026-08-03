const test = require('node:test');
const assert = require('node:assert/strict');
const { csrfProtection, addCsrfToken, clearCsrfTokens } = require('../src/middleware/csrfProtection');

function createReq(method, baseUrl, path, headers = {}, body = {}, cookies = {}) {
  return {
    method,
    baseUrl,
    path,
    headers,
    body,
    cookies,
    ip: '127.0.0.1'
  };
}

function createRes() {
  return {
    statusCode: null,
    payload: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test('allows POST register when CSRF cookie and header match', () => {
  clearCsrfTokens();
  addCsrfToken('test-token');
  const req = createReq('POST', '/api/auth', '/register', {
    'x-csrf-token': 'test-token'
  }, { name: 'Test', email: 'test@example.com', password: 'Password123' }, { csrf_token: 'test-token' });

  const res = createRes();
  let nextCalled = false;

  csrfProtection(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, null);
  assert.equal(nextCalled, true);
});

test('rejects POST register when CSRF token header is missing', () => {
  clearCsrfTokens();
  addCsrfToken('test-token');
  const req = createReq('POST', '/api/auth', '/register', {}, { name: 'Test', email: 'test@example.com', password: 'Password123' }, { csrf_token: 'test-token' });

  const res = createRes();
  let nextCalled = false;

  csrfProtection(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
  assert.equal(res.payload.error, 'CSRF_TOKEN_MISSING');
});

test('rejects POST register when CSRF cookie and header do not match', () => {
  clearCsrfTokens();
  addCsrfToken('test-token');
  const req = createReq('POST', '/api/auth', '/register', {
    'x-csrf-token': 'wrong-token'
  }, { name: 'Test', email: 'test@example.com', password: 'Password123' }, { csrf_token: 'test-token' });

  const res = createRes();
  let nextCalled = false;

  csrfProtection(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
  assert.equal(res.payload.error, 'CSRF_TOKEN_INVALID');
  assert.equal(res.payload.cause, 'cookie_token_mismatch');
});
