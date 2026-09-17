# zippCart API

Store registration API and security setup: [documentation](docs/store-registration.md).

Run the API from this folder:

```powershell
npm run dev
```

Authentication endpoints:

- `POST /api/v1/auth/otp/request` — `{ "phone": "9876543210" }`
- `POST /api/v1/auth/otp/verify` — `{ "phone": "9876543210", "code": "123456" }`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

For local testing, use `NODE_ENV=development` and `OTP_DELIVERY=console` (the default). For real SMS, set `OTP_DELIVERY=2factor` and provide `TWO_FACTOR_API_KEY` in the backend `.env`; the key is never sent to the frontend. 2Factor sends the generated six-digit code and verifies it using its server-side session id. Codes expire after five minutes; resending replaces the previous challenge. MongoDB stores the code hash and provider session id, while the API returns neither.

Run `node --test tests/auth-otp.test.js` for local-delivery, verification, expiry and production-guard checks.

Copy `.env.example` to `.env` before running the API. Local MongoDB is configured as `mongodb://127.0.0.1:27017/aura-shopping`.

Tokens are issued as HTTP-only cookies. `secure` is enabled automatically when `NODE_ENV=production`; production requires HTTPS.


## Cash on delivery checkout

- `POST /api/v1/orders/quote` accepts `shippingAddressId` and `billingAddressId` and returns server-calculated prices plus a checkout key.
- `POST /api/v1/orders` accepts the same address IDs, the checkout key and `paymentMethod: "cod"`. UPI is not accepted yet.
- Both endpoints accept an optional `buyNow` object (`productId`, `color`, `size`, `quantity`, `purchaseId`) to check out one item without changing the cart. `purchaseId` identifies one purchase attempt for safe retries.
- `GET /api/v1/orders` lists the authenticated user's saved orders.
- Orders snapshot products and both addresses, remain unpaid for COD, and clear only cart rows matching the purchased snapshot. Unique checkout/cart keys prevent duplicate order creation on retries.
- `DELIVERY_CHARGE` is a flat fee in INR, defaulting to 0. The checkout shows this charge before placing the order.
- Prices, stock and product options come from active seller products owned by approved, active stores. Checkout recalculates the current seller price; no additional GST is added.
- Run `node tests/order.test.js` and `node tests/address.test.js` for service/validation checks. These use test doubles and do not require or verify a live MongoDB connection.
- Restart the backend after adding these routes. Order placement stores the order in this app; courier dispatch and fulfillment integrations are not included.

### Reorder

`POST /api/v1/orders/:id/reorder` accepts an `items` array of product IDs, selected color and size, and quantities (1-99). Only currently available options from that authenticated user's order are accepted. Chosen quantities replace matching cart quantities; unrelated cart rows and the original order are preserved. Retries use absolute quantities. Run `node tests/reorder.test.js` for validation, ownership and cart-write checks.

### Customer catalogue and returns

Public `GET /api/v1/products` supports page, category and search; `GET /api/v1/products/:id` returns the full seller description and color photo galleries; `POST /api/v1/products/lookup` accepts `{ "ids": [...] }` for cart and favorites. Only active, in-stock products from approved, active stores appear. The customer cart stores color and size per item. Sellers see only their own items through `GET /api/v1/seller/orders` and can mark their shipment dispatched with `POST /api/v1/seller/orders/:id/dispatch`. After all shipments are dispatched, the order owner confirms receipt with `POST /api/v1/orders/:id/received`. `POST /api/v1/orders/:id/return` accepts a 10–500 character reason within 24 hours **of confirmed receipt**, only once. It records a `return_requested` status for review; this endpoint does not process a refund or arrange pickup. Delivery is a configured flat charge shown at checkout; no courier ETA is promised. Stock is checked at checkout but is not reserved or decremented by this flow yet. COD payment is not marked paid merely because the customer confirms receipt.

`GET /api/v1/orders/:id` returns only the authenticated owner's order detail. Startup backfills shipment data for older orders whose product IDs still resolve to real seller products. Historical orders made with retired sample-product IDs remain visible, but cannot be tracked or returned through this shipment flow.

## Account profile

Authenticated `GET /api/v1/profile` and `PATCH /api/v1/profile` load/update fullName, email and profileImage. Phone/identity edits are rejected. Profile images are resized JPEG data URLs stored as text on the user document (maximum 500 KB decoded); explicit null removes a photo. Login and refresh responses include saved profile fields. The existing MongoDB database name is retained to preserve current accounts and orders.

Run `node tests/profile.test.js` for profile checks. Photo selection and live database persistence still require a device/backend smoke test.

## Seller products

Approved, active store owners can manage their own catalogue through `GET /api/v1/seller/products?page=1`, `GET /api/v1/seller/products/:id`, `POST /api/v1/seller/products`, `PUT /api/v1/seller/products/:id`, and `PATCH /api/v1/seller/products/:id/status`.
Product writes require the signed-in seller cookie and a JSON body. The server validates category, prices, stock, SKU, separate `sizes` and named `colors` with their own `images`, then stores products under the approved store ID. SKU is generated when omitted and unique within a store. A product accepts five general photos, four per color, and 12 photos total; images are bounded and re-encoded as JPEG. List responses contain 30 products per page, `total`, `nextPage`, and a small cover image. Full galleries load from the detail endpoint. Older single-photo and text-variant records remain readable. Active seller products appear in the customer storefront and checkout catalogue.
