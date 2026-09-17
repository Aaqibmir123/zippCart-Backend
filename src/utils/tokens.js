import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

export function createAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

export function createRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token) {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub || typeof decoded.phone !== 'string') {
    throw new Error('Invalid access token payload.');
  }

  return { sub: decoded.sub, phone: decoded.phone };
}

export function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub || typeof decoded.phone !== 'string') {
    throw new Error('Invalid refresh token payload.');
  }

  return { sub: decoded.sub, phone: decoded.phone };
}
