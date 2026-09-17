import { z } from 'zod';

export const profileImageSchema = z.string().max(700000).refine((value) => {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[1], 'base64');
  return bytes.length <= 512000 && bytes.length >= 4 && bytes.toString('base64') === match[1]
    && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
}, 'Choose a JPEG profile photo smaller than 500 KB.');
export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.union([z.string().trim().email().max(254).transform((value) => value.toLowerCase()), z.literal('')]),
  profileImage: profileImageSchema.nullable().optional(),
}).strict();
