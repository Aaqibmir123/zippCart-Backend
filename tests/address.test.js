import assert from 'node:assert/strict';
import test from 'node:test';
import { addressSchema, addressParamsSchema } from '../src/user/validators/address.validator.js';
import { createAddressService } from '../src/user/services/address.service.js';
import { createAddressRepository } from '../src/user/repositories/address.repository.js';
import { AddressModel } from '../src/user/models/address.model.js';

const input = { name: ' Test User ', phone: '9876543210', line1: 'Flat 204', locality: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', label: 'Home' };
test('address validation trims fields and rejects invalid contact and address data', () => {
  assert.equal(addressSchema.parse(input).name, 'Test User');
  assert.equal(addressSchema.parse(input).landmark, '');
  for (const patch of [{ phone: '123' }, { pincode: '000000' }, { line1: '' }, { name: ' ' }, { label: 'Invalid' }]) {
    assert.equal(addressSchema.safeParse({ ...input, ...patch }).success, false);
  }
  assert.equal(addressParamsSchema.safeParse({ id: 'invalid' }).success, false);
  assert.equal('userId' in addressSchema.parse({ ...input, userId: 'attacker' }), false);
});
test('address service serializes public fields and handles missing addresses', async () => {
  const record = { ...addressSchema.parse(input), _id: '123', userId: 'private-user-id' };
  const service = createAddressService({ list: async () => [record], create: async () => record, update: async () => null, remove: async () => null });
  const [address] = await service.list('owner');
  assert.equal(address.id, '123');
  assert.equal('userId' in address, false);
  assert.equal((await service.create('owner', input)).name, 'Test User');
  await assert.rejects(service.update('other-user', '123', input), { statusCode: 404 });
  await assert.rejects(service.remove('other-user', '123'), { statusCode: 404 });
});
test('repository scopes updates and removals to the authenticated owner', async (t) => {
  const calls = [];
  t.mock.method(AddressModel, 'findOneAndUpdate', async (...args) => { calls.push(args); return null; });
  t.mock.method(AddressModel, 'findOneAndDelete', async (...args) => { calls.push(args); return null; });
  const repository = createAddressRepository();
  await repository.update('owner', 'address-id', addressSchema.parse(input));
  await repository.remove('owner', 'address-id');
  assert.deepEqual(calls[0][0], { _id: 'address-id', userId: 'owner' });
  assert.deepEqual(calls[1][0], { _id: 'address-id', userId: 'owner' });
});
