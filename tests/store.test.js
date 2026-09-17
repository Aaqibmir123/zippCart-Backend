import assert from "node:assert/strict";
import test from "node:test";
import { createDecipheriv, randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  registrationSchema,
  documentNames,
} from "../src/seller/validators/store.validator.js";
import { prepareDocuments } from "../src/seller/services/store-documents.service.js";
import { encryptStoreData } from "../src/utils/store-crypto.js";
import { createStoreService } from "../src/seller/services/store.service.js";

export async function validRegistration() {
  const photo = await sharp({
    create: { width: 30, height: 30, channels: 3, background: "#abcdef" },
  })
    .jpeg()
    .toBuffer();
  return {
    storeName: " Corner Store ",
    ownerFullName: "Test Owner",
    mobileNumber: "9876543210",
    storeCategory: "Grocery",
    fullAddress: "Shop 12, Main Market, Kupwara, JK",
    locality: "Main Market",
    pincode: "193222",
    ...Object.fromEntries(
      documentNames.map((name) => [
        name,
        `data:image/jpeg;base64,${photo.toString("base64")}`,
      ]),
    ),
    payout: { method: "upi", upiId: "store@bank" },
    sellerTermsAccepted: true,
    termsVersion: "2026-09-11",
  };
}

test("store schema rejects ownership/status injection, missing consent, numbers instead of cards and invalid payout", async () => {
  const valid = await validRegistration();
  assert.equal(registrationSchema.parse(valid).storeName, "Corner Store");
  for (const patch of [
    { ownerId: "other" },
    { status: "approved" },
    { isActive: true },
    { sellerTermsAccepted: false },
    { termsVersion: "old" },
    { aadhaarCard: "123456789012" },
    { panCard: "ABCDE1234F" },
    { payout: { method: "upi", upiId: "invalid" } },
    { payout: { method: "bank", accountNumber: "123" } },
    { storeName: { $gt: "" } },
    { storeCategory: "unknown" },
  ])
    assert.equal(
      registrationSchema.safeParse({ ...valid, ...patch }).success,
      false,
    );
  for (const name of documentNames)
    assert.equal(
      registrationSchema.safeParse({ ...valid, [name]: null }).success,
      false,
    );
});

test("documents decode to clean JPEG and reject disguised, corrupt and oversized input", async () => {
  const valid = await validRegistration();
  const cleaned = await prepareDocuments(valid);
  assert.equal(
    (await sharp(Buffer.from(cleaned.aadhaarCard.base64, "base64")).metadata())
      .format,
    "jpeg",
  );
  for (const invalid of [
    "data:image/jpeg;base64,AAAA",
    "data:image/jpeg;base64,/9j/2Q==",
    "data:image/jpeg;base64," + Buffer.alloc(1048577, 255).toString("base64"),
  ]) {
    await assert.rejects(prepareDocuments({ ...valid, panCard: invalid }), {
      statusCode: 400,
    });
  }
});

test("AES-GCM ciphertext is randomized, authenticated and bound to the owner", () => {
  const key = randomBytes(32);
  const value = { payout: "private", documents: "private" };
  const first = encryptStoreData(value, "owner", key);
  const second = encryptStoreData(value, "owner", key);
  assert.notDeepEqual(first.ciphertext, second.ciphertext);
  function decode(owner, tag = first.tag) {
    const decipher = createDecipheriv("aes-256-gcm", key, first.iv);
    decipher.setAAD(Buffer.from(`store:${owner}:v1`));
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([
        decipher.update(first.ciphertext),
        decipher.final(),
      ]).toString(),
    );
  }
  assert.deepEqual(decode("owner"), value);
  assert.throws(() => decode("other"));
  assert.throws(() => decode("owner", randomBytes(16)));
});

test("store service saves one pending/inactive store and never returns private fields", async () => {
  let record;
  const repository = {
    accountExists: async (id) => id === "owner" ? { phone: "9876543210" } : null,
    syncOwner: async () => {},
    findByOwner: async (id) => (id === "owner" ? record : null),
    create: async (data) => {
      record = { ...data, _id: "store-id", createdAt: new Date() };
      return record;
    },
  };
  const service = createStoreService(repository, {
    key: () => randomBytes(32),
  });
  const first = await service.register("owner", await validRegistration());
  assert.equal(first.created, true);
  assert.equal(record.ownerId, "owner");
  assert.equal(record.status, "pending");
  assert.equal(record.isActive, false);
  assert.ok(record.termsAcceptedAt instanceof Date);
  for (const field of [
    "privateData",
    "payout",
    "aadhaarCard",
    "mobileNumber",
    "ownerFullName",
  ])
    assert.equal(field in first.store, false);
  assert.equal(
    record.privateData.ciphertext.includes(Buffer.from("store@bank")),
    false,
  );
  assert.equal(
    (await service.register("owner", await validRegistration())).created,
    false,
  );
  await assert.rejects(service.get("other"), { statusCode: 401 });
});

test("concurrent duplicate index errors return the existing owner record without replacing it", async () => {
  let reads = 0;
  const record = { _id: "existing", status: "pending", isActive: false };
  const service = createStoreService(
    {
      accountExists: async () => ({ phone: "9876543210" }),
      syncOwner: async () => {},
      findByOwner: async () => (++reads === 1 ? null : record),
      create: async () => {
        throw { code: 11000 };
      },
    },
    { key: () => randomBytes(32), prepare: async () => ({}) },
  );
  assert.equal(
    (await service.register("owner", await validRegistration())).store.id,
    "existing",
  );
});

test("missing encryption configuration fails closed before processing any documents", async () => {
  let processed = false;
  const service = createStoreService(
    { accountExists: async () => ({ phone: "9876543210" }),
      syncOwner: async () => {}, findByOwner: async () => null },
    {
      key: () => {
        throw new Error("No key");
      },
      prepare: async () => {
        processed = true;
      },
    },
  );
  await assert.rejects(service.register("owner", await validRegistration()));
  assert.equal(processed, false);
});
