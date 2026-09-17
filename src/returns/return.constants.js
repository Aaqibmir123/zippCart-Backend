export const closedStatuses = ['rejected', 'cancelled', 'refund_completed', 'exchange_completed'];
export const returnStatuses = ['under_review', 'information_needed', 'pickup_pending', 'pickup_scheduled',
  'pickup_failed', 'picked_up', 'inspection', 'inspection_disputed', 'refund_pending',
  'exchange_pending', 'replacement_dispatched', ...closedStatuses];
export const addressEditableStatuses = ['under_review', 'information_needed', 'pickup_pending', 'pickup_failed'];
export const reasons = ['damaged', 'wrong_item', 'not_as_described', 'size_fit', 'other'];
export const maximumCases = 100;
export const maximumEvents = 100;
