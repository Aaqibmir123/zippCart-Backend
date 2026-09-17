import { z } from 'zod';

export const requestOtpSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, 'Phone number must contain exactly 10 digits.'),
});

export const verifyOtpSchema = requestOtpSchema.extend({
  code: z.string().regex(/^\d{6}$/, 'OTP must contain exactly 6 digits.'),
});
