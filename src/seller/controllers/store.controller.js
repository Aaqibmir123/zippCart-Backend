export function createStoreController(service) {
  async function getMyStore(request, response) {
    const store = await service.get(request.user.id);
    response.json({ store });
  }

  async function register(request, response) {
    const { store, created } = await service.register(request.user.id, request.body);
    response.status(created ? 201 : 200).json({ store });
  }

  return { getMyStore, register };
}
