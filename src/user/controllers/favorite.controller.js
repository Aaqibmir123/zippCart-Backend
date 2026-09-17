import { favoriteProductParamsSchema } from '../validators/favorite.validator.js';

export function createFavoriteController(favoriteService) {
  async function getFavorites(request, response) {
    const favorites = await favoriteService.getFavorites(request.user.id);
    response.status(200).json({ favorites });
  }

  async function addFavorite(request, response) {
    const { productId } = favoriteProductParamsSchema.parse(request.params);
    await favoriteService.addFavorite(request.user.id, productId);
    response.status(200).json({ message: 'Added to favorites.' });
  }

  async function removeFavorite(request, response) {
    const { productId } = favoriteProductParamsSchema.parse(request.params);
    await favoriteService.removeFavorite(request.user.id, productId);
    response.status(200).json({ message: 'Removed from favorites.' });
  }

  return { addFavorite, getFavorites, removeFavorite };
}
