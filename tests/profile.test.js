import assert from 'node:assert/strict';
import test from 'node:test';
import { updateProfileSchema, profileImageSchema } from '../src/user/validators/profile.validator.js';
import { createProfileService } from '../src/user/services/profile.service.js';
import { publicUser } from '../src/utils/public-user.js';

test('profile accepts normalized name/email and forbids changing phone or identity', () => {
  const data = { fullName: ' Test User ', email: 'TEST@example.com', profileImage: null };
  const parsed = updateProfileSchema.parse(data);
  assert.equal(parsed.fullName, 'Test User');
  assert.equal(parsed.email, 'test@example.com');
  for (const patch of [{ phone: '9876543210' }, { userId: 'other-user' }, { fullName: ' ' }, { email: 'invalid' }]) {
    assert.equal(updateProfileSchema.safeParse({ ...data, ...patch }).success, false);
  }
});
test('image input rejects external URLs, non-JPEG, malformed and oversized data', () => {
  for (const value of ['https://example.com/photo.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,' + 'A'.repeat(700001)]) {
    assert.equal(profileImageSchema.safeParse(value).success, false);
  }
});
test('profile updates only permitted fields for authenticated user and returns saved photo', async () => {
  let received;
  const record = { _id: 'owner', phone: '9876543210', fullName: 'Saved User', email: 'user@example.com', profileImage: 'saved-photo', createdAt: new Date() };
  const service = createProfileService({ findById: async (id) => id === 'owner' ? record : null, updateProfile: async (id, data) => { received = { id, data }; return record; } });
  const response = await service.update('owner', { fullName: 'Saved User', email: 'user@example.com', phone: '123', userId: 'other', profileImage: 'saved-photo' });
  assert.deepEqual(received, { id: 'owner', data: { fullName: 'Saved User', email: 'user@example.com', profileImage: 'saved-photo' } });
  assert.equal(response.phone, '9876543210');
  assert.equal(response.profileImage, 'saved-photo');
  await assert.rejects(service.get('missing'), { statusCode: 404 });
});
test('auth response serializer retains profile after session restore and supports older accounts', () => {
  assert.equal(publicUser({ id: '1', phone: '9876543210', fullName: 'Saved', profileImage: 'photo' }).profileImage, 'photo');
  assert.equal(publicUser({ id: '1', phone: '9876543210' }).fullName, '');
  assert.equal(publicUser({ id: '1', phone: '9876543210' }).profileImage, null);
});
