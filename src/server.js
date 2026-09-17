import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { StoreModel } from './shared/models/store.model.js';
import { ProductModel } from './seller/models/product.model.js';
import { CartItemModel } from './user/models/cart-item.model.js';
import { UserModel } from './shared/models/user.model.js';
import { getStoreKey } from './utils/store-crypto.js';
import { backfillOrderShipments } from './user/migrations/backfill-order-shipments.js';

async function startServer() {
  if (env.NODE_ENV === 'production') getStoreKey();
  await connectDatabase();
  await StoreModel.createIndexes();
  await ProductModel.createIndexes();
  await backfillOrderShipments();
  await CartItemModel.createIndexes();
  const oldCartIndex = (await CartItemModel.collection.indexes()).find((index) =>
    Object.keys(index.key).join(',') === 'userId,productId' && index.unique);
  if (oldCartIndex) await CartItemModel.collection.dropIndex(oldCartIndex.name);
  await UserModel.createIndexes();
  const app = createApp();
  app.listen(env.PORT, '0.0.0.0', () => {
    console.info(`zippCart API listening on http://localhost:${env.PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start API server.', error);
  process.exit(1);
});
