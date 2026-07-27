const test = require('node:test');
const assert = require('node:assert/strict');
const { apiGuard } = require('../src/middleware/apiGuard');

function createRes() {
  return {
    statusCode: null,
    payload: null,
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

test('rejects nested NoSQL-like operators in mutating requests before routes', () => {
  const req = {
    method: 'POST',
    body: { filter: { $ne: null } },
    query: {},
    params: {},
    headers: {},
    originalUrl: '/api/auth/login'
  };
  const res = createRes();
  let nextCalled = false;

  apiGuard(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 400);
  assert.equal(nextCalled, false);
  assert.equal(res.payload.success, false);
});

test('allows normal JSON payloads through the global API guard', () => {
  const req = {
    method: 'POST',
    body: { name: 'Ana', email: 'ana@example.com' },
    query: {},
    params: {},
    headers: { 'content-type': 'application/json' },
    originalUrl: '/api/auth/register'
  };
  const res = createRes();
  let nextCalled = false;

  apiGuard(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, null);
  assert.equal(nextCalled, true);
});
