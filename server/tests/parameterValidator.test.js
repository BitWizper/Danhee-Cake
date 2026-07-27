const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAllParameters } = require('../src/middleware/parameterValidator');
const methodBlocker = require('../src/middleware/methodBlocker');

function createRes() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this[name] = value;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

function createReq(method, body, query = {}, params = {}) {
  return {
    method,
    body,
    query,
    params,
    originalUrl: '/api/auth/login'
  };
}

test('rejects XSS payloads in mutating requests before any controller runs', () => {
  const req = createReq('POST', { message: '<script>alert(1)</script>' });
  const res = createRes();
  let nextCalled = false;

  validateAllParameters(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 400);
  assert.equal(nextCalled, false);
  assert.equal(res.payload.success, false);
});

test('allows safe payloads in mutating requests', () => {
  const req = createReq('POST', { name: 'Ana', email: 'ana@example.com' });
  const res = createRes();
  let nextCalled = false;

  validateAllParameters(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, null);
  assert.equal(nextCalled, true);
});

test('blocks dangerous HTTP methods before they reach routes', () => {
  const req = { method: 'TRACE', path: '/api/categories' };
  const res = createRes();
  let nextCalled = false;

  methodBlocker(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 405);
  assert.equal(nextCalled, false);
  assert.equal(res.payload.success, false);
});
