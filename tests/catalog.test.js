import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogService } from '../src/user/services/catalog.service.js';

const productId = '1'.repeat(24);
const product = {
  _id: productId, name: 'Cotton Shirt', category: 'Fashion', description: 'Soft cotton shirt',
  brand: 'Aura', sku: 'AURA-1', price: 599, mrp: 999, stock: 5, active: true,
  coverImage: 'data:image/jpeg;base64,aGVsbG8=', images: ['photo'],
  sizes: ['M', 'L'], colors: [{ name: 'Blue', images: ['blue-photo'] }],
  storeId: { storeName: 'Aura Store' },
};
const service = createCatalogService({
  list: async () => ({ products: [product], total: 1 }),
  lookup: async (ids) => ids.includes(productId) ? [product] : [],
  find: async (id) => id === productId ? product : null,
});

test('public catalogue lists and looks up seller products with real price and thumbnail', async () => {
  const result = await service.list({ page: 1, limit: 24 });
  assert.equal(result.total, 1);
  assert.equal(result.nextPage, null);
  assert.deepEqual(result.products[0], {
    id: productId, name: 'Cotton Shirt', category: 'Fashion', brand: 'Aura',
    price: 599, mrp: 999, stock: 5, coverImage: product.coverImage, storeName: 'Aura Store',
  });
  assert.deepEqual(await service.lookup([productId]), result.products);
});

test('product detail exposes actual description, sizes and color galleries', async () => {
  const detail = await service.get(productId);
  assert.equal(detail.description, product.description);
  assert.deepEqual(detail.sizes, ['M', 'L']);
  assert.deepEqual(detail.colors, product.colors);
  assert.equal(detail.storeName, 'Aura Store');
  await assert.rejects(service.get('2'.repeat(24)), { statusCode: 404 });
});
