import { createAppError } from '../utils/app-error.js';
import { addressEditableStatuses, closedStatuses } from './return.constants.js';

const fail = (message) => { throw createAppError(message, 409); };
const requireStatus = (record, allowed) => {
  if (!allowed.includes(record.status)) fail('This action is not available at the current return stage. Refresh the request.');
};

export function customerTransition(record, input) {
  if (closedStatuses.includes(record.status)) fail('This return case is closed.');
  switch (input.action) {
    case 'message': break;
    case 'payout':
      if (record.preference !== 'refund') fail('Switch to a refund before adding payout details.');
      break;
    case 'reply':
      requireStatus(record, ['information_needed', 'inspection_disputed']);
      record.status = record.resumeStatus || 'inspection_disputed';
      record.resumeStatus = undefined;
      record.proofDueAt = undefined;
      if (input.pickupAddress) {
        if (!addressEditableStatuses.includes(record.status)) fail('The pickup address cannot change after collection.');
        record.pickupAddress = input.pickupAddress;
      }
      break;
    case 'address':
      requireStatus(record, addressEditableStatuses);
      if (record.status === 'information_needed' && !addressEditableStatuses.includes(record.resumeStatus))
        fail('The pickup address cannot change at this stage.');
      record.pickupAddress = input.pickupAddress;
      break;
    case 'reschedule':
      requireStatus(record, ['pickup_pending', 'pickup_scheduled', 'pickup_failed']);
      record.status = 'pickup_pending';
      record.pickup = undefined;
      record.addressChangeRequested = true;
      if (input.pickupAddress) record.proposedAddress = input.pickupAddress;
      break;
    case 'cancel':
      requireStatus(record, [...addressEditableStatuses, 'pickup_scheduled']);
      if (record.status === 'information_needed' && !addressEditableStatuses.includes(record.resumeStatus))
        fail('A collected return cannot be cancelled.');
      record.status = 'cancelled';
      break;
    case 'switch_refund':
      requireStatus(record, ['under_review', 'pickup_pending', 'pickup_scheduled', 'pickup_failed', 'inspection', 'exchange_pending']);
      if (record.preference !== 'exchange') fail('This case already requests a refund.');
      record.preference = 'refund';
      record.refundMethod = input.refundMethod;
      if (record.status === 'exchange_pending') record.status = 'refund_pending';
      break;
    default: fail('Unknown customer action.');
  }
}

export function adminTransition(record, input, now) {
  if (closedStatuses.includes(record.status)) fail('This return case is closed.');
  switch (input.action) {
    case 'message': break;
    case 'ask_information': {
      requireStatus(record, ['under_review', 'information_needed', 'pickup_pending', 'inspection_disputed', 'exchange_pending', 'refund_pending']);
      const due = new Date(input.dueAt);
      if (due <= now || due.getTime() > now.getTime() + 7 * 86400000) fail('Choose a response deadline within the next 7 days.');
      if (record.status !== 'information_needed') record.resumeStatus = record.status;
      record.status = 'information_needed';
      record.proofDueAt = due;
      break;
    }
    case 'approve':
      requireStatus(record, ['under_review']);
      record.status = 'pickup_pending';
      break;
    case 'reject':
      requireStatus(record, ['under_review', 'inspection_disputed', 'information_needed']);
      if (record.status === 'information_needed' && !['under_review', 'inspection_disputed'].includes(record.resumeStatus))
        fail('Resolve the current fulfilment stage before closing this case.');
      record.status = 'rejected';
      break;
    case 'schedule': {
      requireStatus(record, ['pickup_pending', 'pickup_failed', 'pickup_scheduled']);
      const start = new Date(input.pickup.start);
      const end = new Date(input.pickup.end);
      if (start <= now || end <= start || start.getTime() > now.getTime() + 30 * 86400000)
        fail('Choose a future collection window within the next 30 days.');
      if (record.proposedAddress && !input.acceptAddressChange) fail('Confirm the requested address change before scheduling.');
      if (record.proposedAddress) record.pickupAddress = record.proposedAddress;
      record.proposedAddress = undefined;
      record.addressChangeRequested = false;
      record.pickup = input.pickup;
      record.status = 'pickup_scheduled';
      break;
    }
    case 'pickup_failed': requireStatus(record, ['pickup_scheduled']); record.status = 'pickup_failed'; break;
    case 'picked_up': requireStatus(record, ['pickup_scheduled']); record.status = 'picked_up'; break;
    case 'received': requireStatus(record, ['picked_up']); record.status = 'inspection'; break;
    case 'inspection_dispute':
      requireStatus(record, ['inspection', 'inspection_disputed']); record.status = 'inspection_disputed'; break;
    case 'inspection_pass':
      requireStatus(record, ['inspection', 'inspection_disputed']);
      if (input.receivedQuantity !== record.items.reduce((sum, item) => sum + item.quantity, 0))
        fail('Received quantity does not match. Record an inspection dispute first.');
      record.status = record.preference === 'refund' ? 'refund_pending' : 'exchange_pending';
      break;
    case 'refund_complete':
      requireStatus(record, ['refund_pending']);
      if (record.refundMethod !== 'cash' && !record.payoutEncrypted) fail('Ask the customer to add refund details first.');
      if (record.preference !== 'refund' || !input.paymentVerified) fail('Verify payment receipt and the actual refund first.');
      if (Math.round(input.amount * 100) !== Math.round(record.amount * 100)) fail('Refund amount must match the selected items.');
      if (input.method !== record.refundMethod) fail('Use the refund method confirmed by the customer.');
      record.reference = input.reference;
      record.status = 'refund_completed';
      break;
    case 'dispatch_exchange':
      requireStatus(record, ['exchange_pending']);
      if (record.preference !== 'exchange' || !input.stockConfirmed) fail('Confirm replacement stock before dispatch.');
      record.replacement = { reference: input.reference, carrier: input.carrier, dispatchedAt: now };
      record.status = 'replacement_dispatched';
      break;
    case 'complete_exchange':
      requireStatus(record, ['replacement_dispatched']); record.status = 'exchange_completed'; break;
    default: fail('Unknown admin action.');
  }
}
