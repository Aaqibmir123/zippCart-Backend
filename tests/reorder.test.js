import assert from 'node:assert/strict';
import test from 'node:test';
import { createReorderService } from '../src/user/services/reorder.service.js';
import { reorderSchema } from '../src/user/validators/order.validator.js';
import { createOrderRepository } from '../src/user/repositories/order.repository.js';
import { CartItemModel } from '../src/user/models/cart-item.model.js';
const productId = '1'.repeat(24);
const otherId = '2'.repeat(24);

test('reorder validates ownership and purchased products before changing the cart', async () => {
  const calls = [];
  const order = { items: [{ productId, color: 'Blue', size: 'M', quantity: 2 }] };
  const reorder = createReorderService({
    findById: async (userId) => userId === 'owner' ? order : null,
    setCartItems: async (...args) => { calls.push(args); },
  }, { findPurchasable: async (id) => id === productId ? { stock: 10, sizes: ['M'], colors: [{ name: 'Blue' }] } : null });
  const chosen = { productId, color: 'Blue', size: 'M', quantity: 3 };
  await assert.rejects(reorder('other', 'order1', [chosen]), { statusCode: 404 });
  await assert.rejects(reorder('owner', 'order1', [{ ...chosen, productId: otherId }]), { statusCode: 400 });
  assert.equal(calls.length, 0);
  await reorder('owner', 'order1', [chosen]);
  assert.deepEqual(calls[0], ['owner', [chosen]]);
  assert.equal(order.items[0].quantity, 2);
  await assert.rejects(reorder('owner', 'order1', [{ ...chosen, size: 'L' }]), { statusCode: 400 });
});
test('invalid quantities, duplicate products and empty selections are rejected', () => {
  for (const items of [[], [{ productId, quantity: 0 }], [{ productId, quantity: 100 }], [{ productId, quantity: 1.5 }], [{ productId, quantity: 1 }, { productId, quantity: 2 }]]) {
    assert.equal(reorderSchema.safeParse({ items }).success, false);
  }
  assert.equal(reorderSchema.safeParse({ items: [{ productId, quantity: 99 }] }).success, true);
});
test('cart writes set absolute quantities and target only the selected products for that owner', async (t) => {
  let operations;
  t.mock.method(CartItemModel, 'bulkWrite', async (data) => { operations = data; });
  await createOrderRepository().setCartItems('owner', [{ productId, color: 'Blue', size: 'M', quantity: 4 }]);
  assert.deepEqual(operations, [{ updateOne: {
    filter: { userId: 'owner', productId, color: 'Blue', size: 'M' },
    update: { $set: { quantity: 4 }, $setOnInsert: { userId: 'owner', productId, color: 'Blue', size: 'M' } },
    upsert: true,
  } }]);
});
