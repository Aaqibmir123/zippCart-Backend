import { publicUser } from '../../utils/public-user.js';
import { createAppError } from '../../utils/app-error.js';
export function createProfileService(repository) {
  const serialize = (user) => {
    if (!user) throw createAppError('Account not found.', 404);
    return publicUser(user);
  };
  return {
    get: async (id) => serialize(await repository.findById(id)),
    update: async (id, { fullName, email, profileImage }) => serialize(await repository.updateProfile(id, {
      fullName, email, ...(profileImage !== undefined ? { profileImage } : {}),
    })),
  };
}
