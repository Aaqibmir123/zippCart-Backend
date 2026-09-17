import { clearAuthCookies, setAuthCookies } from '../../utils/auth-cookies.js';
import { createAppError } from '../../utils/app-error.js';
import { requestOtpSchema, verifyOtpSchema } from '../validators/auth.validator.js';

export function createAuthController(authService) {
  async function requestOtp(request, response) {
    const { phone } = requestOtpSchema.parse(request.body);
    const delivery = await authService.requestOtp(phone);
    response.status(202).json(delivery);
  }

  async function verifyOtp(request, response) {
    const { phone, code } = verifyOtpSchema.parse(request.body);
    const tokens = await authService.verifyOtp(phone, code);
    setAuthCookies(response, tokens.accessToken, tokens.refreshToken);
    response.status(200).json({ message: 'Phone verified successfully.', user: tokens.user });
  }

  async function refresh(request, response) {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) throw createAppError('Refresh token is required.', 401);

    const tokens = await authService.refresh(refreshToken);
    setAuthCookies(response, tokens.accessToken, tokens.refreshToken);
    response.status(200).json({ message: 'Session refreshed.', user: tokens.user });
  }

  async function logout(_request, response) {
    clearAuthCookies(response);
    response.status(204).send();
  }

  return { requestOtp, verifyOtp, refresh, logout };
}
