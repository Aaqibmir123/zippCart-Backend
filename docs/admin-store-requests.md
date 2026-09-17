# Admin store requests

Sign in using the phone configured as `ADMIN_PHONE`, open the account drawer and
select **Store requests**. The dashboard shows counts, status filters, paginated
request cards, owner/address/payout details, document viewing and pending request
approval/rejection. No demo requests are seeded into the application database.

## API

All endpoints require live backend admin authorization and return `Cache-Control:
no-store`. Native clients use the authenticated session cookie. Browser clients
also require an exact configured origin match.

- `GET /api/v1/admin/stores?status=pending&limit=15&cursor=<id>`: summary-only list.
  Filters: pending, approved, rejected or all. Cursor pagination uses descending
  ObjectId order; limits are bounded to 1–50. `nextCursor: null` ends the list.
- `GET /api/v1/admin/stores/counts`: global status counts using aggregation.
- `GET /api/v1/admin/stores/:id`: decrypted owner/address/payout details and consent
  metadata. Document bytes and ciphertext are excluded.
- `GET /api/v1/admin/stores/:id/documents/:document`: one JPEG data URL. Supported
  names are storeFrontPhoto, aadhaarCard, panCard and shopLicense. There are no
  public document URLs. Invalid IDs/names fail validation.
- `PATCH /api/v1/admin/stores/:id/status`: approve/reject. The UI includes
  `expectedStatus: "pending"`; a changed request returns 409 so another review is
  not silently overwritten. Refreshing shows its current decision.

The `(status, _id)` index serves filtered pagination. Summary reads use explicit
projections and `lean()`, without loading encrypted documents. Details and photos
are loaded on demand and AES-GCM decryption is bound to the registered owner.
Frontend detail/photo query caches are removed when their views close.

## Files

Backend routes, controllers, validators, repositories and services stay in their
existing responsibility folders. Dashboard UI, cards, detail screen, document
viewer, API types and styles live in `frontend/features/admin-stores`.

Integration coverage in `tests/store.integration.test.js` uses an isolated
temporary database. It covers customer/anonymous denial, admin access, actual
decryption, bounded pagination, counts, invalid inputs and stale review conflicts.
