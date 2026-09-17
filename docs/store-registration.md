# Store registration

Authenticated, create-once registration; one store per account. Products, document
payout execution and product management are outside this feature.

## API

- `POST /api/v1/stores`: strict JSON, creates a store (201); a retry for the same
  account returns its saved registration (200), without changing any fields.
- `GET /api/v1/stores/me`: returns `{ store: summary | null }` for the session owner.
- Ownership comes from the access cookie. Guest requests receive 401.
- Neither endpoint returns identity images, owner contact details or bank/UPI data.
- Client-supplied `ownerId`, `status`, `isActive`, extra fields, invalid categories,
  missing documents and missing/stale terms acceptance are rejected.

POST fields: `storeName`, `ownerFullName`, `mobileNumber`, `storeCategory`,
`fullAddress`, `locality`, `pincode`, `storeFrontPhoto`, `aadhaarCard`, `panCard`,
`shopLicense`, `payout`, `sellerTermsAccepted: true`, `termsVersion: "2026-09-11"`.
Documents are JPEG data URLs, at most 1 MiB decoded each. The frontend resizes and
encodes selected photos. Never send local file URIs. The authenticated route alone
permits a 6 MiB JSON body; other API routes retain their existing 1 MiB limit.

Payout is either `{ method: "upi", upiId }` or
`{ method: "bank", accountHolder, accountNumber, ifsc }`. Shape checks do not verify
bank ownership, document authenticity or that the contact mobile is OTP verified.

## Structure and database

Store registration follows the same folders as auth, cart and orders:

- `src/routes/store.routes.js`: endpoints and middleware wiring only.
- `src/controllers/store.controller.js`: HTTP request/response handling.
- `src/middlewares/store.middleware.js`: origin checks, caching, rate limits and body parsing.
- `src/validators/store.validator.js`: required fields and request validation.
- `src/services/store.service.js`: registration rules and ownership.
- `src/services/store-documents.service.js`: photo decoding and sanitizing.
- `src/repositories/store.repository.js`: database queries.
- `src/models/store.model.js`: schema and unique index.
- `src/utils/store-crypto.js`: private-data encryption.

There is no separate backend `features` folder. New backend functionality should
follow these existing responsibility folders.

`stores.ownerId` references `User` and has a unique index, created before the server
starts accepting requests. This protects concurrent submissions and serves the
owner lookup. Reads use an explicit projection and `lean()`. No `populate()` or
aggregation is needed for a single owner summary; adding joins would add cost.

One atomic document insert stores summary fields plus an encrypted private payload.
This avoids orphaned uploads and a multi-document transaction requirement. The
bounded payload stays below MongoDB's 16 MiB document limit. Larger future media
should move to private object storage with authenticated access and cleanup.

## Security and setup

- Set `STORE_ENCRYPTION_KEY` to 32 cryptographically random bytes encoded as 64 hex
  characters. Local `.env` has been configured without printing the key. Never commit
  it, send it to the frontend or derive it from a JWT secret. Store it in a secret
  manager for deployment and back it up separately from MongoDB.
- AES-256-GCM uses a new IV per record and binds ciphertext to its owner as AAD.
  Format version is 1. Key rotation requires a deliberate decrypt/re-encrypt
  migration; replacing the key makes existing records unreadable.
- Private fields use `select: false`, explicit response allowlists and no public
  file URLs. Sharp decodes/re-encodes images, strips metadata and limits pixel count.
- Registration is limited to 10 attempts per account per 15 minutes before body
  parsing. The limiter is per process; use a shared rate-limit store and an edge
  request limit when deploying multiple API instances.
- Browser requests require an exact `CLIENT_ORIGIN` match, including reads.
  Native requests have no browser Origin. Configure your web origin explicitly;
  wildcard does not authorize cross-origin access to these routes.
- Production startup requires the encryption key. Deploy with HTTPS, private
  database credentials and strong distinct JWT secrets. The existing OTP service
  still uses development console delivery; configure real SMS before public use.

The app shows the saved pending state on reopening Your store. Network errors keep
form data available for retry; successful submission clears form state. The saved
record starts as `status: "pending"`, `isActive: false`.

## Account roles and modes

Every account retains `customer`. Registration accepts a separate store contact number
and adds `store_owner` to the signed-in account. The contact number is not a login identity,
does not transfer store ownership, and is not OTP-verified by this form.
The unique user phone index and atomic
upsert prevent duplicate accounts, including concurrent sign-ins. No new account
is created during registration.

`ADMIN_PHONE` is configured in backend `.env`. Admin authority is resolved from that
configuration on each request, not from client data or token claims. Set the same
value in deployment secrets; no admin role is granted when it is absent.

`GET /api/v1/auth/me` and login/refresh/profile responses include `roles`,
`storeStatus` (`none`, `pending`, `approved`, `rejected`), `isActive` and `mode`.
`POST /api/v1/auth/mode` accepts only `{ mode: "customer" | "seller" }`.
Customer Mode is always available; Seller Mode requires an approved active store.
`GET /api/v1/seller/session` demonstrates the shared backend seller authorization
boundary. All future seller routes must stay behind this boundary.

Admin-only `PATCH /api/v1/admin/stores/:id/status` accepts
`{ storeStatus: "approved" | "rejected" }`. It records reviewer and review time,
sets activation accordingly and synchronizes the owner's account flags. There is
an approval dashboard in the admin account drawer. Regular customers and store
owners receive 403 on all admin routes.

The store's existing `status` field is authoritative; `storeStatus` is also exposed
in the store response for clarity and compatibility. User status fields are a
denormalized copy. Authorization always reads the current store, so rejection
revokes access even with an old token or stale user flags. Legacy accounts without
role fields resolve to customer, and existing store owners are recognized without
creating another account. If account-flag synchronization fails after saving the
store, retrying registration/review repairs it; no second store is created.

## Verification

`node tests/store.test.js` checks schema, decoding, encryption and service behavior.

For real HTTP/MongoDB coverage from the backend directory in PowerShell:

```powershell
$env:STORE_INTEGRATION='1'
node tests/store.integration.test.js
```

This creates a randomly named isolated `zippcart_store_test_*` database using the
configured MongoDB host, then drops only that database. It tests unauthorized
requests, origin rejection, status injection, simultaneous registration retries,
encrypted persistence and owner isolation. Ordinary test runs skip this integration
test unless explicitly enabled.
