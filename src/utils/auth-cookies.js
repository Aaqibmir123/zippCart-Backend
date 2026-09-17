import { env } from '../config/env.js';

const isProduction = env.NODE_ENV === 'production';
const cookieBase = {
  httpOnly: true,
  sameSite: isProduction ? 'none' : 'lax',
  secure: isProduction,
  path: '/',
};

export function setAuthCookies(response, accessToken, refreshToken) {
  response.cookie('accessToken', accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
  response.cookie('refreshToken', refreshToken, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookies(response) {
  response.clearCookie('accessToken', cookieBase);
  response.clearCookie('refreshToken', cookieBase);
}
