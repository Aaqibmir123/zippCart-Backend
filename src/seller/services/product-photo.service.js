import sharp from 'sharp';
import { createAppError } from '../../utils/app-error.js';

export async function prepareProductPhoto(dataUrl) {
  if (dataUrl === null) return null;
  if (dataUrl === undefined) return undefined;
  const encoded = dataUrl.slice('data:image/jpeg;base64,'.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 512000 || bytes.length < 4 || bytes.toString('base64') !== encoded || bytes[0] !== 255 || bytes[1] !== 216) {
    throw createAppError('Choose a valid JPEG photo smaller than 500 KB.', 400);
  }
  try {
    const clean = await sharp(bytes, { limitInputPixels: 16000000, failOn: 'warning' })
      .rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 }).toBuffer();
    if (clean.length > 512000) throw new Error('Photo too large');
    return `data:image/jpeg;base64,${clean.toString('base64')}`;
  } catch {
    throw createAppError('Could not read product photo. Choose another image.', 400);
  }
}

export async function makeProductThumbnail(dataUrl) {
  if (!dataUrl) return null;
  const bytes = Buffer.from(dataUrl.slice('data:image/jpeg;base64,'.length), 'base64');
  const thumbnail = await sharp(bytes).resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 65 }).toBuffer();
  return `data:image/jpeg;base64,${thumbnail.toString('base64')}`;
}
