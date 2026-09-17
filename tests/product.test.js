import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createProductService, publicProduct } from '../src/seller/services/product.service.js';
import { prepareProductPhoto, makeProductThumbnail } from '../src/seller/services/product-photo.service.js';
import { productSchema } from '../src/seller/validators/product.validator.js';

const input = {
  name: 'Denim jacket', category: 'Fashion', description: 'Classic denim jacket',
  brand: '', sku: '', sizes: ['S', 'M', 'L'], images: [], colors: [], price: 1899.50, mrp: 2599,
  stock: 5, active: true,
};

function fixture() {
  const rows = [];
  let allowedOwner = 'owner';
  const repository = {
    storeForOwner: async (owner) => owner === allowedOwner ? { _id: 'store-a' } : null,
    list: async (store, skip, limit) => rows.filter((row) => row.storeId === store).slice(skip, skip + limit),
    count: async (store) => rows.filter((row) => row.storeId === store).length,
    find: async (store, id) => rows.find((row) => row.storeId === store && row._id === id) ?? null,
    create: async (data) => {
      if (rows.some((row) => row.storeId === data.storeId && row.sku === data.sku)) throw { code: 11000 };
      const row = { ...data, _id: 'a'.repeat(24) };
      rows.push(row);
      return row;
    },
    update: async (store, id, data) => {
      const row = rows.find((item) => item.storeId === store && item._id === id);
      if (!row) return null;
      Object.assign(row, data);
      return row;
    },
    setStatus: async (store, id, active) => {
      const row = rows.find((item) => item.storeId === store && item._id === id);
      if (!row) return null;
      row.active = active;
      return row;
    },
  };
  return { service: createProductService(repository, async (photo) => photo, async (photo) => photo ?? null), rows, revoke: () => { allowedOwner = null; } };
}

test('product validation rejects unknown fields, bad prices and unsupported categories', () => {
  assert.equal(productSchema.safeParse(input).success, true);
  assert.equal(productSchema.safeParse({ ...input, category: 'Grocery' }).success, false);
  assert.equal(productSchema.safeParse({ ...input, price: 2700 }).success, false);
  assert.equal(productSchema.safeParse({ ...input, price: 1.001 }).success, false);
  assert.equal(productSchema.safeParse({ ...input, storeId: 'other' }).success, false);
  assert.equal(productSchema.safeParse({ ...input, sizes: ['S', 's'] }).success, false);
  assert.equal(productSchema.safeParse({ ...input, colors: [{ name: 'Blue', images: [] }, { name: 'blue', images: [] }] }).success, false);
  const image = 'data:image/jpeg;base64,/9j/';
  assert.equal(productSchema.safeParse({ ...input, images: Array(5).fill(image), colors: [{ name: 'Blue', images: Array(4).fill(image) }, { name: 'Red', images: Array(4).fill(image) }] }).success, false);
});

test('create, list, edit and status operate only inside approved owner store', async () => {
  const { service, rows, revoke } = fixture();
  const created = await service.create('owner', input);
  assert.match(created.sku, /^ZC-[A-F0-9]{12}$/);
  assert.equal(rows[0].storeId, 'store-a');
  const listing = await service.list('owner');
  assert.equal(listing.products[0].name, input.name);
  assert.equal('images' in listing.products[0], false);
  assert.equal(listing.total, 1);
  assert.equal((await service.get('owner', created.id)).name, input.name);
  await assert.rejects(service.list('other'), { statusCode: 403 });
  await assert.rejects(service.get('other', created.id), { statusCode: 403 });
  await assert.rejects(service.update('other', created.id, input), { statusCode: 403 });
  const updated = await service.update('owner', created.id, { ...input, name: 'Blue denim jacket', sku: '' });
  assert.equal(updated.name, 'Blue denim jacket');
  assert.equal(updated.sku, created.sku);
  assert.equal((await service.setStatus('owner', created.id, { active: false })).active, false);
  await assert.rejects(service.setStatus('owner', 'b'.repeat(24), { active: false }), { statusCode: 404 });
  revoke();
  await assert.rejects(service.create('owner', input), { statusCode: 403 });
});

test('duplicate SKU returns conflict and color photos stay associated with their color', async () => {
  const { service } = fixture();
  const image = 'data:image/jpeg;base64,/9j/';
  const created = await service.create('owner', { ...input, sku: 'JACKET-01', images: [image], colors: [{ name: 'Navy', images: [image] }] });
  assert.deepEqual(created.images, [image]);
  assert.deepEqual(created.colors, [{ name: 'Navy', images: [image] }]);
  await assert.rejects(service.create('owner', { ...input, sku: 'JACKET-01' }), { statusCode: 409 });
  const updated = await service.update('owner', created.id, { ...input, sku: 'JACKET-01', colors: [{ name: 'Black', images: [] }] });
  assert.deepEqual(updated.colors, [{ name: 'Black', images: [] }]);
  assert.deepEqual(updated.images, []);
});

test('older single-photo and variants records remain readable', () => {
  const product = publicProduct({ _id: 'a'.repeat(24), photo: 'old-photo', variants: 'S, M', colors: [] });
  assert.deepEqual(product.images, ['old-photo']);
  assert.deepEqual(product.sizes, ['S', 'M']);
});

test('product photo is decoded and re-encoded as a bounded JPEG', async () => {
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#6a9a78' } }).jpeg().toBuffer();
  const saved = await prepareProductPhoto(`data:image/jpeg;base64,${bytes.toString('base64')}`);
  assert.match(saved, /^data:image\/jpeg;base64,/);
  assert.equal((await sharp(Buffer.from(saved.split(',')[1], 'base64')).metadata()).format, 'jpeg');
  const thumbnail = await makeProductThumbnail(saved);
  assert.equal((await sharp(Buffer.from(thumbnail.split(',')[1], 'base64')).metadata()).width, 32);
  await assert.rejects(prepareProductPhoto('data:image/jpeg;base64,AAAA'), { statusCode: 400 });
});
