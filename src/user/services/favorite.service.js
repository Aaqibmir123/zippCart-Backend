export function createFavoriteService(favoriteRepository) {
  async function getFavorites(userId) {
    const favorites = await favoriteRepository.listByUserId(userId);
    return favorites.map((favorite) => ({ productId: favorite.productId }));
  }

  async function addFavorite(userId, productId) {
    await favoriteRepository.add(userId, productId);
  }

  async function removeFavorite(userId, productId) {
    await favoriteRepository.remove(userId, productId);
  }

  return { addFavorite, getFavorites, removeFavorite };
}
