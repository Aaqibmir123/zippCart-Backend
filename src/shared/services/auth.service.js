import { createAppError } from '../../utils/app-error.js';
import { publicUser } from '../../utils/public-user.js';
import { createOtpCode, hashOtp } from '../../utils/otp.js';
import { createAccessToken, createRefreshToken, verifyRefreshToken } from '../../utils/tokens.js';
import { createOtpDelivery } from './otp-delivery.js';

const OTP_EXPIRY_MS = 5 * 60 * 1000;

export function createAuthService(userRepository, otpRepository, delivery = createOtpDelivery()) {
  async function requestOtp(phone) {
    delivery.assertAvailable();
    const code = createOtpCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    const receipt = await delivery.send(phone, code, expiresAt);
    await otpRepository.save(phone, hashOtp(code), expiresAt, receipt.sessionId);
    const { sessionId: _sessionId, ...publicReceipt } = receipt;
    return publicReceipt;
  }

  async function verifyOtp(phone, code) {
    delivery.assertAvailable();
    const otpRecord = await otpRepository.find(phone);
    if (!otpRecord || otpRecord.expiresAt < new Date() || otpRecord.codeHash !== hashOtp(code)) {
      throw createAppError('Invalid or expired OTP.', 401);
    }
    await delivery.verify(phone, code, otpRecord);

    await otpRepository.remove(phone);
    const user = await userRepository.findOrCreateByPhone(phone);
    const payload = { sub: user.id, phone: user.phone };
    return {
      accessToken: createAccessToken(payload),
      refreshToken: createRefreshToken(payload),
      user: publicUser(user),
    };
  }

  async function refresh(refreshToken) {
    const payload = verifyRefreshToken(refreshToken);
    const user = await userRepository.findByPhone(payload.phone);
    if (!user) throw createAppError('Session user no longer exists.', 401);

    return {
      accessToken: createAccessToken(payload),
      refreshToken: createRefreshToken(payload),
      user: publicUser(user),
    };
  }

  return { requestOtp, verifyOtp, refresh };
}
