import { addCartItemSchema, cartItemParamsSchema, updateCartItemSchema } from '../validators/cart.validator.js';

export function createCartController(cartService) {
  async function getCart(request, response) {
    const items = await cartService.getCart(request.user.id);
    response.status(200).json({ items });
  }

  async function addItem(request, response) {
    const data = addCartItemSchema.parse(request.body);
    const item = await cartService.addItem(request.user.id, data);
    response.status(200).json({ item, message: 'Added to cart.' });
  }

  async function updateItem(request, response) {
    const { itemId } = cartItemParamsSchema.parse(request.params);
    const { quantity } = updateCartItemSchema.parse(request.body);
    const item = await cartService.setQuantity(request.user.id, itemId, quantity);
    response.status(200).json({ item, message: 'Cart updated.' });
  }

  async function removeItem(request, response) {
    const { itemId } = cartItemParamsSchema.parse(request.params);
    await cartService.removeItem(request.user.id, itemId);
    response.status(200).json({ message: 'Removed from cart.' });
  }

  return { addItem, getCart, removeItem, updateItem };
}
