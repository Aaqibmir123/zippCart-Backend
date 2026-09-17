import { createHash, randomInt } from 'node:crypto';

export function createOtpCode() {
  return String(randomInt(100000, 1000000));
}

export function hashOtp(code) {
  return createHash('sha256').update(code).digest('hex');
}
