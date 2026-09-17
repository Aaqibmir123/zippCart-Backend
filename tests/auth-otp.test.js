import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthService } from '../src/shared/services/auth.service.js';
import { createOtpDelivery } from '../src/shared/services/otp-delivery.js';
import { createAuthController } from '../src/shared/controllers/auth.controller.js';

function fixture(mode = 'development', channel = 'console') {
  let record;
  let latestCode;
  let writes = 0;
  let deliveries = 0;
  const repository = {
    save: async (phone, codeHash, expiresAt) => { writes++; record = { phone, codeHash, expiresAt }; },
    find: async () => record,
    remove: async () => { record = undefined; },
  };
  const delivery = createOtpDelivery({ NODE_ENV: mode, OTP_DELIVERY: channel }, (line) => {
    deliveries++;
    latestCode = line.match(/: (\d{6}) /)?.[1];
  });
  const userRepository = { findOrCreateByPhone: async (phone) => ({ id: 'a'.repeat(24), phone, roles: ['customer'] }) };
  return {
    service: createAuthService(userRepository, repository, delivery),
    code: () => latestCode, record: () => record, writes: () => writes, deliveries: () => deliveries,
  };
}

test('local OTP is logged once, stored hashed and never returned as a code or SMS success', async () => {
  const f = fixture();
  const receipt = await f.service.requestOtp('9876543210');
  assert.match(f.code(), /^\d{6}$/);
  assert.equal(f.deliveries(), 1);
  assert.equal(receipt.delivery, 'console');
  assert.equal(receipt.expiresInSeconds, 300);
  assert.match(receipt.message, /No SMS was sent/);
  assert.equal(JSON.stringify(receipt).includes(f.code()), false);
  assert.notEqual(f.record().codeHash, f.code());
  assert.ok(f.record().expiresAt > new Date());
});

test('a correct local code verifies once; wrong and expired codes fail', async () => {
  const f = fixture();
  await f.service.requestOtp('9876543210');
  await assert.rejects(f.service.verifyOtp('9876543210', '000000'), { statusCode: 401 });
  const result = await f.service.verifyOtp('9876543210', f.code());
  assert.equal(result.user.phone, '9876543210');
  assert.ok(result.accessToken);
  await assert.rejects(f.service.verifyOtp('9876543210', f.code()), { statusCode: 401 });
  await f.service.requestOtp('9876543210');
  f.record().expiresAt = new Date(Date.now() - 1);
  await assert.rejects(f.service.verifyOtp('9876543210', f.code()), { statusCode: 401 });
});

test('resending replaces the saved challenge and returns local delivery instructions', async () => {
  const f = fixture();
  await f.service.requestOtp('9876543210');
  const previousRecord = f.record();
  const receipt = await f.service.requestOtp('9876543210');
  assert.notEqual(f.record(), previousRecord);
  assert.equal(f.writes(), 2);
  assert.equal(receipt.resendAfterSeconds, 45);
  assert.equal(receipt.delivery, 'console');
  assert.ok(await f.service.verifyOtp('9876543210', f.code()));
});

test('production and disabled delivery reject before generating a challenge or logging secrets', async () => {
  for (const [mode, channel] of [['production', 'console'], ['development', 'disabled']]) {
    const f = fixture(mode, channel);
    await assert.rejects(f.service.requestOtp('9876543210'), { statusCode: 503 });
    await assert.rejects(f.service.verifyOtp('9876543210', '123456'), { statusCode: 503 });
    assert.equal(f.writes(), 0);
    assert.equal(f.deliveries(), 0);
  }
});

test('HTTP controller returns the actual delivery receipt instead of claiming SMS success', async () => {
  const f = fixture();
  let status;
  let body;
  const response = { status: (value) => { status = value; return response; }, json: (value) => { body = value; } };
  await createAuthController(f.service).requestOtp({ body: { phone: '9876543210' } }, response);
  assert.equal(status, 202);
  assert.equal(body.delivery, 'console');
  assert.match(body.message, /backend terminal/);
  assert.equal(body.code, undefined);
});

test('2Factor delivery sends and verifies through the provider without exposing its session id', async () => {
  const requests = [];
  const fetchMock = async (url) => {
    requests.push(url);
    return { ok: true, json: async () => ({ Status: 'Success', Details: 'provider-session-id' }) };
  };
  const delivery = createOtpDelivery(
    { NODE_ENV: 'development', OTP_DELIVERY: '2factor', TWO_FACTOR_API_KEY: 'test-key' },
    undefined,
    fetchMock,
  );
  const record = {};
  const repository = {
    save: async (_phone, _hash, _expiresAt, sessionId) => { record.sessionId = sessionId; },
    find: async () => ({ ...record, expiresAt: new Date(Date.now() + 60_000), codeHash: 'unused' }),
    remove: async () => {},
  };
  const userRepository = { findOrCreateByPhone: async (phone) => ({ id: 'a'.repeat(24), phone, roles: ['customer'] }) };
  const service = createAuthService(userRepository, repository, delivery);
  const receipt = await service.requestOtp('9876543210');
  assert.equal(receipt.delivery, '2factor');
  assert.equal(receipt.sessionId, undefined);
  assert.match(requests[0], /\/SMS\/9876543210\/\d{6}$/);
});
