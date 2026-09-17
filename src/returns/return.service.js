import { randomBytes } from 'node:crypto';
import { createAppError } from '../utils/app-error.js';
import { adminTransition, customerTransition } from './return.transitions.js';
import { maximumCases, maximumEvents } from './return.constants.js';
import { openPayout, setPayout } from './return-payout.js';

const newId = () => randomBytes(12).toString('hex');
export function publicCase(record, orderId, admin = false) {
  const { storeId, clientKey, payoutEncrypted, customerReadVersion, adminReadVersion, ...data } = record;
  const readVersion = (admin ? adminReadVersion : customerReadVersion) ?? -1;
  const unread = record.history.some((event, index) => index > readVersion && event.actor === (admin ? 'customer' : 'admin'));
  return { ...data, unread, orderId: String(orderId), history: record.history.map(({ actorId, ...event }) => event) };
}
export function createReturnService(repository, catalog, clock = () => new Date()) {
  async function requireOrder(id, user) {
    const admin = user.roles?.includes('admin');
    const order = await repository.order(id, admin ? undefined : user.id);
    if (!order) throw createAppError('Order not found.', 404);
    return order;
  }
  async function checkPhotos(orderId, actorId, ids = []) {
    if (!ids.length) return;
    if ((await repository.photos(orderId, actorId, ids)).length !== ids.length)
      throw createAppError('One or more photos do not belong to this order and uploader.', 400);
  }
  async function exchangeAvailable(record) {
    const totals = new Map();
    for (const item of record.items) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
    const products = await Promise.all([...totals.keys()].map((id) => catalog.findPurchasable(id)));
    const byId = new Map(products.filter(Boolean).map((item) => [String(item._id), item]));
    for (const item of record.items) {
      const product = byId.get(item.productId);
      const sizes = product?.sizes?.length ? product.sizes : (product?.variants?.split(',').map((v) => v.trim()) ?? []);
      const colors = product?.colors?.map((v) => v.name) ?? [];
      if (!product || product.stock < totals.get(item.productId) ||
        (sizes.length ? !sizes.includes(item.exchangeSize) : !!item.exchangeSize) ||
        (colors.length ? !colors.includes(item.exchangeColor) : !!item.exchangeColor))
        throw createAppError('Requested replacement is unavailable. Ask the customer to choose a refund.', 409);
    }
  }
  return {
    list: repository.list,
    inbox: (user, query) => repository.list(query, user.id),
    payout: async (orderId, caseId, user) => {
      const order = await requireOrder(orderId, user);
      const record = order.returnCases?.find((item) => item.id === caseId);
      if (!record) throw createAppError('Return case not found.', 404);
      return record.payoutEncrypted ? openPayout(record.payoutEncrypted, orderId, caseId)
        : record.refundMethod === 'cash' ? { method: 'cash' } : null;
    },
    markRead: async (orderId, caseId, user, version, admin = false) => {
      if (admin && !user.roles?.includes('admin')) throw createAppError('Access denied.', 403);
      const order = await repository.order(orderId, admin ? undefined : user.id);
      const record = order?.returnCases?.find((item) => item.id === caseId);
      if (!record) throw createAppError('Return case not found.', 404);
      if (version > record.version) throw createAppError('Invalid message version.', 400);
      const field = admin ? 'adminReadVersion' : 'customerReadVersion';
      if ((record[field] ?? -1) >= version) return;
      record[field] = version;
      if (!await repository.save(order, order.returnCases)) throw createAppError('Request updated. Try again.', 409);
    },
    orderCases: async (orderId, user, admin = false) => {
      if (admin && !user.roles?.includes('admin')) throw createAppError('Access denied.', 403);
      const order = await repository.order(orderId, admin ? undefined : user.id);
      if (!order) throw createAppError('Order not found.', 404);
      return (order.returnCases ?? []).map((record) => publicCase(record, orderId, admin));
    },
    create: async (orderId, user, input) => {
      // Ownership is required even if an administrator shops as a customer.
      const order = await repository.order(orderId, user.id);
      if (!order) throw createAppError('Order not found.', 404);
      const cases = order.returnCases ?? [];
      const retried = cases.filter((item) => item.clientKey === input.clientKey);
      if (retried.length) return retried.map((item) => publicCase(item, orderId));
      const now = clock();
      if (order.returnRequestedAt) throw createAppError('This order already has a legacy return request.', 409);
      if (order.status !== 'delivered' || !order.receivedAt || new Date(order.receivedAt) > now ||
        now.getTime() - new Date(order.receivedAt).getTime() > 86400000)
        throw createAppError('Request a return within 24 hours of confirmed delivery.', 409);
      await checkPhotos(orderId, user.id, input.photoIds);
      const groups = new Map();
      for (const selection of input.items) {
        const purchased = order.items[selection.index];
        if (!purchased?.storeId) throw createAppError('This item cannot be returned here. Contact support.', 400);
        const used = cases.filter((record) => record.status !== 'cancelled')
          .flatMap((record) => record.items).filter((item) => item.index === selection.index)
          .reduce((sum, item) => sum + item.quantity, 0);
        if (selection.quantity > purchased.quantity - used)
          throw createAppError('This quantity already has a return request or exceeds the purchase.', 409);
        const storeId = String(purchased.storeId);
        const items = groups.get(storeId) ?? [];
        items.push({ index: selection.index, productId: purchased.productId, name: purchased.name,
          color: purchased.color ?? '', size: purchased.size ?? '', price: purchased.price, quantity: selection.quantity,
          exchangeColor: selection.exchangeColor, exchangeSize: selection.exchangeSize });
        groups.set(storeId, items);
      }
      if (cases.length + groups.size > maximumCases) throw createAppError('Return case limit reached. Contact support.', 409);
      const created = [...groups].map(([storeId, items]) => {
        const id = newId();
        const record = { id, clientKey: input.clientKey, requestId: `RET-${id.toUpperCase()}`, storeId,
          status: 'under_review', preference: input.preference, reason: input.reason, description: input.description,
          items, photoIds: input.photoIds, pickupAddress: input.pickupAddress, refundMethod: input.refundMethod,
          amount: Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100,
          createdAt: now, updatedAt: now, version: 0,
          history: [{ id: input.clientKey, action: 'submitted', actor: 'customer', actorId: user.id, at: now,
            note: input.description, photoIds: input.photoIds, status: 'under_review', address: input.pickupAddress }],
        };
        if (input.preference === 'refund' && input.payout) setPayout(record, input.payout, orderId);
        return record;
      });
      const saved = await repository.save(order, [...cases, ...created]);
      if (!saved) throw createAppError('The order changed. Refresh and retry your request.', 409);
      return created.map((item) => publicCase(item, orderId));
    },
    action: async (orderId, caseId, user, input, admin = false) => {
      if (admin && !user.roles?.includes('admin')) throw createAppError('Access denied.', 403);
      const order = await repository.order(orderId, admin ? undefined : user.id);
      const cases = order?.returnCases ?? [];
      const record = cases.find((item) => item.id === caseId);
      if (!record) throw createAppError('Return case not found.', 404);
      if (record.history.some((event) => event.id === input.clientKey && event.actorId === user.id))
        return publicCase(record, orderId, admin);
      if (record.version !== input.version) throw createAppError('This case changed. Refresh before continuing.', 409);
      if (record.history.length >= maximumEvents) throw createAppError('Case history limit reached. Contact support.', 409);
      if (input.action === 'message' && record.history.length >= maximumEvents - 20)
        throw createAppError('Message limit reached. Use Contact us for further assistance.', 409);
      await checkPhotos(orderId, user.id, input.photoIds);
      const now = clock();
      if (admin && record.preference === 'exchange' && ['approve', 'dispatch_exchange'].includes(input.action))
        await exchangeAvailable(record);
      if (admin) adminTransition(record, input, now);
      else customerTransition(record, input);
      if (!admin && ['payout', 'switch_refund'].includes(input.action)) {
        if (input.action === 'switch_refund' && input.payout.method !== input.refundMethod)
          throw createAppError('Refund method and payout details must match.', 400);
        setPayout(record, input.payout, orderId);
      }
      record.updatedAt = now;
      record.version++;
      record.history.push({ id: input.clientKey, action: input.action, actor: admin ? 'admin' : 'customer',
        actorId: user.id, at: now, note: input.action === 'payout' ? 'Refund details updated securely.' : input.note,
        photoIds: input.photoIds ?? [], status: record.status,
        ...(input.pickupAddress ? { address: input.pickupAddress } : {}),
        ...(input.pickup ? { schedule: input.pickup, address: record.pickupAddress } : {}),
      });
      const saved = await repository.save(order, cases);
      if (!saved) throw createAppError('Another update was saved first. Refresh and try again.', 409);
      return publicCase(record, orderId, admin);
    },
    requireOrder, checkPhotos,
  };
}
