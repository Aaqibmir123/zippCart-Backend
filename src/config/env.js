import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  OTP_DELIVERY: z.enum(['console', '2factor', 'disabled']).default('console'),
  TWO_FACTOR_API_KEY: z.string().min(1).optional(),
  ADMIN_PHONE: z.string().regex(/^[6-9]\d{9}$/).optional(),
  DELIVERY_CHARGE: z.coerce.number().int().min(0).default(0),
  CLIENT_ORIGIN: z.string().default('*'),
  MONGODB_URI: z.string().url().default('mongodb://127.0.0.1:27017/aura-shopping'),
  JWT_ACCESS_SECRET: z.string().min(32).default('development-access-secret-change-this-before-production'),
  JWT_REFRESH_SECRET: z.string().min(32).default('development-refresh-secret-change-this-before-production'),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;
  for (const field of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (value[field].startsWith('development-') || value[field].startsWith('replace-with-')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Set a private production signing secret.' });
    }
  }
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_REFRESH_SECRET'], message: 'Access and refresh secrets must be different.' });
  }
  if (value.OTP_DELIVERY === '2factor' && !value.TWO_FACTOR_API_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['TWO_FACTOR_API_KEY'], message: 'Set TWO_FACTOR_API_KEY when 2Factor delivery is enabled.' });
  }
});

export const env = envSchema.parse(process.env);
