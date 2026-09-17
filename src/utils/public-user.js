export function publicUser(user) {
  return { id: String(user._id ?? user.id), phone: user.phone, fullName: user.fullName ?? '', email: user.email ?? '', profileImage: user.profileImage ?? null, createdAt: user.createdAt, roles: user.roles ?? ['customer'], storeStatus: user.storeStatus ?? 'none', isActive: user.isActive ?? false, mode: user.mode ?? 'customer' };
}
