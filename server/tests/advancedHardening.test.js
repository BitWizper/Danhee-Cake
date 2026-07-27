const test = require('node:test');
const assert = require('node:assert/strict');
const { chatAbuseGuard } = require('../src/middleware/chatAbuseGuard');
const { paymentGuard } = require('../src/middleware/paymentGuard');

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

test('blocks repeated chat abuse from the same user or IP', () => {
  let nextCalled = 0;
  const res = createRes();

  for (let i = 0; i < 6; i += 1) {
    const req = {
      method: 'POST',
      originalUrl: '/api/chat',
      headers: {},
      ip: '203.0.113.10',
      user: { id: 999 },
      body: { message: 'hola' }
    };

    chatAbuseGuard(req, res, () => {
      nextCalled += 1;
    });
  }

  assert.equal(nextCalled, 4);
  assert.equal(res.statusCode, 429);
  assert.equal(res.payload.success, false);
});

test('blocks bursty payment requests from the same IP', () => {
  let nextCalled = 0;
  const res = createRes();

  for (let i = 0; i < 6; i += 1) {
    const req = {
      method: 'POST',
      originalUrl: '/api/payments/oxxo-ticket',
      headers: {},
      ip: '198.51.100.20',
      body: { amount: 120.50, orderId: 'abc' }
    };

    paymentGuard(req, res, () => {
      nextCalled += 1;
    });
  }

  assert.equal(nextCalled, 4);
  assert.equal(res.statusCode, 429);
  assert.equal(res.payload.success, false);
});
