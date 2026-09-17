import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { UserModel } from "../src/shared/models/user.model.js";
import { StoreModel } from "../src/shared/models/store.model.js";
import { createUserRepository } from "../src/shared/repositories/user.repository.js";
import { createAccessToken } from "../src/utils/tokens.js";

test(
  "store HTTP + MongoDB: auth, validation, encrypted persistence, owner isolation and concurrent retry",
  {
    skip: process.env.STORE_INTEGRATION !== "1",
    timeout: 30000,
  },
  async () => {
    const databaseName = `zippcart_store_test_${randomUUID().replaceAll("-", "")}`;
    let server;
    try {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: databaseName,
        serverSelectionTimeoutMS: 5000,
      });
      await StoreModel.createIndexes();
      await UserModel.createIndexes();
      const duplicates = await Promise.all(
        Array.from({ length: 4 }, () =>
          createUserRepository().findOrCreateByPhone("9876543212"),
        ),
      );
      assert.equal(new Set(duplicates.map((user) => user.id)).size, 1);
      assert.equal(await UserModel.countDocuments({ phone: "9876543212" }), 1);
      assert.deepEqual(duplicates[0].roles, ["customer"]);
      assert.equal(duplicates[0].storeStatus, "none");
      const owner = await UserModel.create({ phone: "9876543210" });
      const other = await UserModel.create({ phone: "9876543211" });
      server = createApp().listen(0, "127.0.0.1");
      await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      const url = `http://127.0.0.1:${server.address().port}/api/v1/stores`;
      const cookies = new Map();
      const cookie = (user) => {
        const id = String(user._id);
        if (!cookies.has(id))
          cookies.set(
            id,
            `accessToken=${createAccessToken({ sub: id, phone: user.phone })}`,
          );
        return cookies.get(id);
      };
      const call = (path = "", body, user = owner, extra = {}) =>
        fetch(url + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(user ? { Cookie: cookie(user) } : {}),
            ...extra,
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      assert.equal((await call("/me", undefined, null)).status, 401);
      assert.equal(
        (
          await call("/me", undefined, owner, {
            Origin: "https://untrusted.example",
          })
        ).status,
        403,
      );
      const photo = await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#eeeeee" },
      })
        .jpeg()
        .toBuffer();
      const dataUrl = `data:image/jpeg;base64,${photo.toString("base64")}`;
      const input = {
        storeName: "Test Shop",
        ownerFullName: "Test Owner",
        mobileNumber: "9876543211",
        storeCategory: "Grocery",
        fullAddress: "Test shop, main street, Kupwara, JK",
        locality: "Main Market",
        pincode: "193222",
        storeFrontPhoto: dataUrl,
        aadhaarCard: dataUrl,
        panCard: dataUrl,
        shopLicense: dataUrl,
        payout: { method: "upi", upiId: "test@bank" },
        sellerTermsAccepted: true,
        termsVersion: "2026-09-11",
      };
      assert.equal((await call("", { ...input, isActive: true })).status, 400);
      assert.equal(
        (await call("", { ...input, mobileNumber: "123" })).status,
        400,
      );
      assert.equal(
        (await call("", input, owner, { Origin: "https://untrusted.example" }))
          .status,
        403,
      );
      const responses = await Promise.all([call("", input), call("", input)]);
      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [200, 201],
      );
      const results = await Promise.all(
        responses.map((response) => response.json()),
      );
      assert.equal(results[0].store.id, results[1].store.id);
      assert.equal(results[0].store.isActive, false);
      assert.equal(results[0].store.status, "pending");
      assert.equal(await StoreModel.countDocuments(), 1);
      const accountCall = (path, body, actor = owner, method = "POST") =>
        fetch(url.replace("/stores", path), {
          method: body === undefined ? "GET" : method,
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie(actor),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const pendingUser = (await (await accountCall("/auth/me")).json()).user;
      assert.deepEqual(pendingUser.roles, ["customer", "store_owner"]);
      assert.equal(pendingUser.storeStatus, "pending");
      const persistedOwner = await UserModel.findById(owner._id).lean();
      assert.equal(persistedOwner.phone, owner.phone);
      assert.equal(await UserModel.countDocuments(), 3);
      assert.equal(await StoreModel.countDocuments({ ownerId: owner._id }), 1);
      assert.equal(await StoreModel.countDocuments({ ownerId: other._id }), 0);
      assert.deepEqual((await UserModel.findById(other._id).lean()).roles, ["customer"]);
      assert.ok(
        persistedOwner.roles.includes("customer") &&
          persistedOwner.roles.includes("store_owner"),
      );
      assert.equal(persistedOwner.storeStatus, "pending");
      assert.equal((await accountCall("/seller/session")).status, 403);
      assert.equal(
        (await accountCall("/auth/mode", { mode: "seller" })).status,
        403,
      );
      assert.equal(
        (await accountCall("/auth/mode", { mode: "customer" })).status,
        200,
      );
      assert.ok(
        env.ADMIN_PHONE,
        "Configure ADMIN_PHONE for approval authorization tests.",
      );
      const admin = await UserModel.create({ phone: env.ADMIN_PHONE });
      const adminAccount = (
        await (await accountCall("/auth/me", undefined, admin)).json()
      ).user;
      assert.ok(adminAccount.roles.includes("admin"));
      assert.ok(adminAccount.roles.includes("customer"));
      const reviewPath = `/admin/stores/${results[0].store.id}/status`;
      const detailPath = `/admin/stores/${results[0].store.id}`;
      for (const path of [
        "/admin/stores",
        "/admin/stores/counts",
        detailPath,
        `${detailPath}/documents/aadhaarCard`,
      ]) {
        assert.equal((await accountCall(path)).status, 403);
      }
      assert.equal(
        (await fetch(url.replace("/stores", "/admin/stores"))).status,
        401,
      );
      const adminDetailResponse = await accountCall(
        detailPath,
        undefined,
        admin,
      );
      assert.equal(adminDetailResponse.status, 200);
      assert.equal(
        adminDetailResponse.headers.get("cache-control"),
        "no-store",
      );
      const adminDetail = (await adminDetailResponse.json()).store;
      assert.equal(adminDetail.ownerFullName, input.ownerFullName);
      assert.equal(adminDetail.mobileNumber, input.mobileNumber);
      assert.equal(adminDetail.payout.upiId, input.payout.upiId);
      assert.equal("documents" in adminDetail, false);
      assert.equal("privateData" in adminDetail, false);
      const documentResponse = await accountCall(
        `${detailPath}/documents/aadhaarCard`,
        undefined,
        admin,
      );
      assert.equal(documentResponse.status, 200);
      assert.match(
        (await documentResponse.json()).dataUrl,
        /^data:image\/jpeg;base64,/,
      );
      assert.equal(
        (await accountCall(`${detailPath}/documents/unknown`, undefined, admin))
          .status,
        400,
      );
      assert.equal(
        (await accountCall("/admin/stores?status=invalid", undefined, admin))
          .status,
        400,
      );
      const pagingOwner = await UserModel.create({ phone: "9876543213" });
      assert.equal(
        (
          await call(
            "",
            { ...input, mobileNumber: pagingOwner.phone },
            pagingOwner,
          )
        ).status,
        201,
      );
      const pageOne = await (
        await accountCall(
          "/admin/stores?status=pending&limit=1",
          undefined,
          admin,
        )
      ).json();
      assert.equal(pageOne.stores.length, 1);
      assert.ok(pageOne.nextCursor);
      assert.equal("ownerFullName" in pageOne.stores[0], false);
      const pageTwo = await (
        await accountCall(
          `/admin/stores?status=pending&limit=1&cursor=${pageOne.nextCursor}`,
          undefined,
          admin,
        )
      ).json();
      assert.equal(pageTwo.stores.length, 1);
      assert.notEqual(pageTwo.stores[0].id, pageOne.stores[0].id);
      assert.equal(pageTwo.nextCursor, null);
      const totals = await (
        await accountCall("/admin/stores/counts", undefined, admin)
      ).json();
      assert.equal(totals.counts.pending, 2);
      assert.equal(
        (
          await accountCall(
            reviewPath,
            { storeStatus: "approved" },
            owner,
            "PATCH",
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await accountCall(
            reviewPath,
            { storeStatus: "approved" },
            admin,
            "PATCH",
          )
        ).status,
        200,
      );
      const switched = await (
        await accountCall("/auth/mode", { mode: "seller" })
      ).json();
      assert.equal(switched.user.mode, "seller");
      assert.equal(
        (
          await accountCall(
            reviewPath,
            { storeStatus: "rejected", expectedStatus: "pending" },
            admin,
            "PATCH",
          )
        ).status,
        409,
      );
      assert.equal(switched.user.id, String(owner._id));
      assert.ok(switched.user.roles.includes("customer"));
      assert.equal((await accountCall("/seller/session")).status, 200);
      await StoreModel.updateOne(
        { _id: results[0].store.id },
        { $set: { isActive: false } },
      );
      assert.equal((await accountCall("/seller/session")).status, 403);
      assert.equal(
        (
          await accountCall(
            reviewPath,
            { storeStatus: "approved" },
            admin,
            "PATCH",
          )
        ).status,
        200,
      );
      assert.equal((await accountCall("/cart")).status, 200);
      assert.equal(
        (
          await accountCall(
            reviewPath,
            { storeStatus: "rejected" },
            admin,
            "PATCH",
          )
        ).status,
        200,
      );
      assert.equal((await accountCall("/seller/session")).status, 403);
      const rejected = (await (await accountCall("/auth/me")).json()).user;
      assert.equal(rejected.mode, "customer");
      assert.equal(rejected.storeStatus, "rejected");
      assert.equal(rejected.isActive, false);
      assert.equal(
        (await accountCall("/auth/mode", { mode: "seller" })).status,
        403,
      );
      assert.equal((await accountCall("/cart")).status, 200);
      assert.equal(
        (await call("/me").then((response) => response.json())).store.id,
        results[0].store.id,
      );
      assert.equal(
        (
          await call("/me", undefined, other).then((response) =>
            response.json(),
          )
        ).store,
        null,
      );
      const record = await StoreModel.findOne().select("+privateData").lean();
      assert.ok(record.privateData.ciphertext);
      assert.equal("payout" in record, false);
      assert.equal("privateData" in results[0].store, false);
      assert.equal(
        (await call("/me")).headers.get("cache-control"),
        "no-store",
      );
      const malformed = await fetch(url, {
        method: "POST",
        headers: { Cookie: cookie(owner), "Content-Type": "application/json" },
        body: "{",
      });
      assert.equal(malformed.status, 400);
      const oversized = await call("", {
        padding: "x".repeat(6 * 1024 * 1024),
      });
      assert.equal(oversized.status, 413);
      let throttled = false;
      for (let attempt = 0; attempt < 11; attempt++) {
        const response = await call("", {});
        if (response.status === 429) {
          throttled = true;
          break;
        }
      }
      assert.equal(throttled, true);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      // Only the explicitly generated isolated test database can be removed.
      if (
        mongoose.connection.name === databaseName &&
        databaseName.startsWith("zippcart_store_test_")
      ) {
        await mongoose.connection.dropDatabase();
      }
      await mongoose.disconnect();
    }
  },
);
