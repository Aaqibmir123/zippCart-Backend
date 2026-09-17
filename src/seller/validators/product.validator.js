import { z } from 'zod';

const text = (min, max) => z.string().trim().min(min).max(max);
const money = z.number().positive().max(1000000).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
  'Use at most two decimal places.',
);
const image = z.string().max(700000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/);
const images = z.array(image);
const uniqueNames = (values) => new Set(values.map((value) => value.trim().toLowerCase())).size === values.length;

export const productSchema = z.object({
  name: text(2, 100),
  category: z.enum(['Fashion', 'Watches', 'Beauty', 'Home', 'Accessories', 'Electronics', 'Other']),
  description: text(1, 1000),
  brand: text(0, 80).default(''),
  sku: text(0, 60).regex(/^[A-Za-z0-9_-]*$/).transform((value) => value.toUpperCase()).default(''),
  sizes: z.array(text(1, 30)).max(20).refine(uniqueNames, 'Sizes must be unique.').default([]),
  images: images.max(5).default([]),
  colors: z.array(z.object({
    name: text(1, 40),
    images: images.max(4),
  }).strict()).max(8).refine((colors) => uniqueNames(colors.map((color) => color.name)), 'Colors must be unique.').default([]),
  price: money,
  mrp: money,
  stock: z.number().int().min(0).max(1000000),
  active: z.boolean(),
}).strict().refine((value) => value.images.length + value.colors.reduce((total, color) => total + color.images.length, 0) <= 12, {
  path: ['images'], message: 'Add at most 12 photos in total.',
}).refine((value) => [...value.images, ...value.colors.flatMap((color) => color.images)].reduce((total, item) => total + item.length, 0) <= 4000000, {
  path: ['images'], message: 'Photos are too large together.',
}).refine((value) => value.price <= value.mrp, {
  path: ['price'], message: 'Selling price cannot exceed MRP.',
});

export const statusSchema = z.object({ active: z.boolean() }).strict();
export const productIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);
