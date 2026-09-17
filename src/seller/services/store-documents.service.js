import sharp from "sharp";
import { createAppError } from "../../utils/app-error.js";
import { documentNames } from "../validators/store.validator.js";

export async function prepareDocuments(input) {
  const documents = {};
  // Sequential decoding bounds memory instead of decoding four identity photos at once.
  for (const name of documentNames) {
    const encoded = input[name].slice("data:image/jpeg;base64,".length);
    const bytes = Buffer.from(encoded, "base64");
    if (
      bytes.length > 1024 * 1024 ||
      bytes.toString("base64") !== encoded ||
      bytes[0] !== 255 ||
      bytes[1] !== 216
    ) {
      throw createAppError(
        `Invalid ${name} photo. Use a JPEG smaller than 1 MB.`,
        400,
      );
    }
    try {
      const cleaned = await sharp(bytes, {
        limitInputPixels: 16000000,
        failOn: "warning",
      })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      if (cleaned.length > 1024 * 1024) throw new Error("Image too large");
      // Re-encoding strips metadata and never trusts client filenames or remote URLs.
      documents[name] = {
        mimeType: "image/jpeg",
        base64: cleaned.toString("base64"),
      };
    } catch {
      throw createAppError(
        `Could not read ${name}. Choose a clear, valid photo.`,
        400,
      );
    }
  }
  return documents;
}
