import { randomBytes } from 'node:crypto';
import { createAppError } from '../../utils/app-error.js';
import { productSchema, productIdSchema, statusSchema } from '../validators/product.validator.js';
import { prepareProductPhoto, makeProductThumbnail } from './product-photo.service.js';

const PAGE_SIZE = 30;

export function publicProduct(product) {
  const { _id, name, category, description, brand, sku, variants, price, mrp, stock, photo, coverImage, active, createdAt, updatedAt } = product;
  const sizes = product.sizes?.length ? product.sizes : (variants ? variants.split(',').map((value) => value.trim()).filter(Boolean) : []);
  const images = product.images?.length ? product.images : (photo ? [photo] : []);
  const colors = (product.colors ?? []).map((color) => ({ name: color.name, images: color.images ?? [] }));
  return { id: String(_id), name, category, description, brand, sku, sizes, images, colors, coverImage: coverImage ?? photo ?? null, price, mrp, stock, active, createdAt, updatedAt };
}

export function publicProductSummary(product) {
  const { _id, name, category, brand, sku, price, mrp, stock, active, coverImage, photo } = product;
  return { id: String(_id), name, category, brand, sku, price, mrp, stock, active, coverImage: coverImage ?? photo ?? null };
}

export function createProductService(repository, preparePhoto = prepareProductPhoto, makeThumbnail = makeProductThumbnail) {
  async function storeId(ownerId) {
    const store = await repository.storeForOwner(ownerId);
    if (!store) throw createAppError('An approved, active store is required.', 403);
    return store._id;
  }
  async function write(ownerId, input, id) {
    const data = productSchema.parse(input);
    const store = await storeId(ownerId);
    const prepared = { ...data, images: [], colors: [], photo: null, variants: '' };
    for (const image of data.images) prepared.images.push(await preparePhoto(image));
    for (const color of data.colors) {
      const images = [];
      for (const image of color.images) images.push(await preparePhoto(image));
      prepared.colors.push({ name: color.name, images });
    }
    prepared.coverImage = await makeThumbnail(prepared.images[0] ?? prepared.colors.flatMap((color) => color.images)[0]);
    if (!id) prepared.sku ||= `ZC-${randomBytes(6).toString('hex').toUpperCase()}`;
    else if (!prepared.sku) delete prepared.sku;
    try {
      const saved = id
        ? await repository.update(store, productIdSchema.parse(id), prepared)
        : await repository.create({ ...prepared, storeId: store });
      if (!saved) throw createAppError('Product not found.', 404);
      return publicProduct(saved);
    } catch (error) {
      if (error.code === 11000) throw createAppError('This SKU is already used in your store.', 409);
      throw error;
    }
  }
  return {
    list: async (ownerId, page = 1) => {
      const store = await storeId(ownerId);
      const [rows, total] = await Promise.all([
        repository.list(store, (page - 1) * PAGE_SIZE, PAGE_SIZE), repository.count(store),
      ]);
      return { products: rows.slice(0, PAGE_SIZE).map(publicProductSummary), total, nextPage: rows.length > PAGE_SIZE ? page + 1 : null };
    },
    get: async (ownerId, id) => {
      const store = await storeId(ownerId);
      const product = await repository.find(store, productIdSchema.parse(id));
      if (!product) throw createAppError('Product not found.', 404);
      return publicProduct(product);
    },
    create: (ownerId, input) => write(ownerId, input),
    update: (ownerId, id, input) => write(ownerId, input, id),
    setStatus: async (ownerId, id, input) => {
      const { active } = statusSchema.parse(input);
      const store = await storeId(ownerId);
      const saved = await repository.setStatus(store, productIdSchema.parse(id), active);
      if (!saved) throw createAppError('Product not found.', 404);
      return publicProductSummary(saved);
    },
  };
}
