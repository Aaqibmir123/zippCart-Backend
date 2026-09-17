import { z } from "zod";
import { UserModel } from "../models/user.model.js";
import { loadAccountAccess } from "../services/account-access.service.js";
import { publicUser } from "../../utils/public-user.js";
import { createAppError } from "../../utils/app-error.js";

const modeSchema = z.object({ mode: z.enum(["customer", "seller"]) }).strict();

export async function getAccount(request, response) {
  response
    .set("Cache-Control", "no-store")
    .json({ user: publicUser(request.user) });
}

export async function switchAccountMode(request, response) {
  const { mode } = modeSchema.parse(request.body);
  const user = request.user;
  if (
    mode === "seller" &&
    (!user.roles.includes("store_owner") ||
      user.storeStatus !== "approved" ||
      !user.isActive)
  ) {
    throw createAppError(
      "Your store must be approved before switching to Seller Mode.",
      403,
    );
  }
  const saved = await UserModel.findByIdAndUpdate(
    user.id,
    { $set: { mode } },
    { returnDocument: "after" },
  );
  response
    .set("Cache-Control", "no-store")
    .json({ user: publicUser(await loadAccountAccess(saved)) });
}
