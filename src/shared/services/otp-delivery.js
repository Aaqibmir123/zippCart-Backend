import { env } from '../../config/env.js';
import { createAppError } from '../../utils/app-error.js';

const TWO_FACTOR_BASE_URL = 'https://2factor.in/API/V1';

export function createOtpDelivery(settings = env, log = console.info, fetchImpl = fetch) {
  function assertAvailable() {
    if (settings.OTP_DELIVERY === 'disabled' || (settings.NODE_ENV === 'production' && settings.OTP_DELIVERY !== '2factor')) {
      throw createAppError('SMS sign-in is not configured yet. Please try again later.', 503);
    }
    if (settings.OTP_DELIVERY === '2factor' && !settings.TWO_FACTOR_API_KEY) {
      throw createAppError('SMS sign-in is not configured yet. Please try again later.', 503);
    }
  }

  async function send(phone, code, expiresAt) {
    assertAvailable();
    if (settings.OTP_DELIVERY === '2factor') {
      const body = await callApi(`/SMS/${phone}/${code}`);
      return {
        delivery: '2factor',
        message: 'A verification code was sent to your phone.',
        expiresInSeconds: 300,
        resendAfterSeconds: 45,
        sessionId: body.Details,
      };
    }
    log(`[LOCAL OTP] +91 ${phone}: ${code} (expires ${expiresAt.toISOString()}). No SMS sent.`);
    return {
      delivery: 'console',
      message: 'Local testing: your code is in the backend terminal. No SMS was sent.',
      expiresInSeconds: 300,
      resendAfterSeconds: 45,
    };
  }

  async function verify(_phone, code, record) {
    assertAvailable();
    if (settings.OTP_DELIVERY !== '2factor') return;
    if (!record.sessionId) throw createAppError('Invalid or expired OTP.', 401);
    await callApi(`/SMS/VERIFY/${record.sessionId}/${code}`);
  }

  async function callApi(path) {
    try {
      const response = await fetchImpl(`${TWO_FACTOR_BASE_URL}/${settings.TWO_FACTOR_API_KEY}${path}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json();
      if (!response.ok || body.Status !== 'Success') throw new Error(body.Details || '2Factor request failed.');
      return body;
    } catch (error) {
      if (error.statusCode) throw error;
      throw createAppError('Unable to send or verify the OTP. Please try again later.', 502);
    }
  }

  return { assertAvailable, send, verify };
}
