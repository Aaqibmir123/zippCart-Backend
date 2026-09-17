import { z } from "zod";

export const documentNames = [
  "storeFrontPhoto",
  "aadhaarCard",
  "panCard",
  "shopLicense",
];
const image = z
  .string()
  .max(1400000)
  .regex(
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/,
    "Choose a valid JPEG photo.",
  );
const text = (min, max) => z.string().trim().min(min).max(max);
const payout = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("upi"),
      upiId: text(4, 320).regex(
        /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/,
      ),
    })
    .strict(),
  z
    .object({
      method: z.literal("bank"),
      accountHolder: text(2, 100),
      accountNumber: z.string().regex(/^\d{9,18}$/),
      ifsc: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
    })
    .strict(),
]);
export const registrationSchema = z
  .object({
    storeName: text(2, 100),
    ownerFullName: text(2, 100),
    mobileNumber: z.string().regex(/^[6-9]\d{9}$/),
    storeCategory: z.enum([
      "Grocery",
      "Fashion",
      "Electronics",
      "Beauty",
      "Home & Living",
      "Accessories",
      "Food & Beverages",
      "Other",
    ]),
    fullAddress: text(10, 350),
    locality: text(2, 100),
    pincode: z.string().regex(/^[1-9]\d{5}$/),
    storeFrontPhoto: image,
    aadhaarCard: image,
    panCard: image,
    shopLicense: image,
    payout,
    sellerTermsAccepted: z.literal(true),
    termsVersion: z.literal("2026-09-11"),
  })
  .strict();
