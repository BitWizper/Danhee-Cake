const test = require('node:test');
const assert = require('node:assert/strict');
const { apiFuzzingGuard } = require('../src/middleware/apiFuzzingGuard');
const errorHandler = require('../src/middleware/errorHandler');

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

test('rejects oversized or overstuffed parameter payloads before routes', () => {
  const req = {
    method: 'GET',
    query: Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`param${index}`, 'x'])),
    body: {},
    params: {},
    headers: {},
    originalUrl: '/api/cakes'
  };
  const res = createRes();
  let nextCalled = false;

  apiFuzzingGuard(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 400);
  assert.equal(nextCalled, false);
  assert.equal(res.payload.success, false);
  assert.equal(res.payload.error_code, 'PARAMETER_FUZZING_BLOCKED');
});

test('returns a uniform error payload for API failures', () => {
  const req = { method: 'GET', path: '/api/auth/login' };
  const res = createRes();
  const err = new Error('boom');
  err.statusCode = 500;

  errorHandler(err, req, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.success, false);
  assert.equal(res.payload.error_code, 'INTERNAL_SERVER_ERROR');
  assert.equal(res.payload.message, 'boom');
});
