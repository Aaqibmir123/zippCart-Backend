# Refund and exchange workflow

Customers open a request from order details within 24 hours of confirming delivery.
They choose purchased items and quantities, refund or exchange, a reason, proof photos,
and a pickup address. The final review shows the selected items and merchandise amount.
Delivery charges are excluded. A refund requires a preferred method (UPI, bank or cash).
Damaged, wrong and not-as-described items require two distinct photos; each submission
supports up to five. Exchange requests preserve the requested color and size.

Requests are split by seller in one atomic order update. Customers can follow each
case from the order. Sellers see only summaries for their own products. Admin manages
the cases in Returns; the Earlier requests tab retains the legacy workflow.

## Lifecycle

1. Under review: admin approves, rejects with a reason, or requests additional proof.
2. More information: customer replies with text/photos on the same case, even after
   the initial 24-hour window. The case resumes its previous stage after a reply.
3. Pickup pending: customer can update the address. Admin confirms the address and
   records a booked pickup/drop-off window, contact, reference and packing instructions.
4. Scheduled: a customer reschedule/address change returns the case to pickup pending.
   The proposed address requires explicit admin acceptance when booking again.
   Failed pickups can be rescheduled. Admin confirms actual collection and receipt.
5. Inspection: admin confirms the full received quantity or records an issue with
   inspection photos. Clarifications stay in the case history.
6. Refund: admin records the actual full payment, selected method and receipt reference.
   Exchange: admin checks current catalog availability and records the actual replacement
   carrier/tracking reference, then confirms delivery.

Customers can cancel before collection and switch an exchange to refund before dispatch.
Rejected and completed quantities cannot be claimed again; cancelled quantities are
released. A new request still requires the original delivery window.

## Implementation and security

- `src/returns` separates validation, schema, persistence, transitions, service and routes.
- Authenticated routes live under `/api/v1/returns`; admin actions require the admin role.
  Ownership, stage, quantity, photo ownership and amount checks run on the server.
- Strict schemas reject unknown fields. Writes enforce same-origin checks and per-user
  rate limits. Idempotency keys prevent duplicate retries; order revision comparisons
  reject conflicting updates without requiring MongoDB replica-set transactions.
- Typed embedded cases keep seller grouping atomic. Each order is bounded to 100 cases,
  each case to 100 history events, and proof uploads to 100 images per order.
- Proof bytes are stored separately, decoded and re-encoded as bounded JPEGs with metadata
  removed. Images require owner/admin access and use no-store responses. Customer-visible
  admin images must be attached to their case. Removed draft uploads remain private and
  count toward the cap; no automatic retention/deletion job is configured.
- Indexed case status/date queries, lean reads, projected order summaries and paginated
  admin aggregation avoid loading proof bytes and histories into list screens.
- The old customer return endpoint returns 410 so outdated clients cannot bypass proof
  and pickup confirmation. Existing legacy cases remain reviewable by admin.

## Operational boundaries

Courier booking and payouts are manual operations, recorded after they occur. No online
payment or courier integration is added. The form captures the refund destination;
format checks do not verify a live UPI ID, bank account ownership or IFSC serviceability.
Admin must verify the beneficiary before making the actual payout.
Replacement availability is checked at approval and dispatch; this workflow does not
reserve or decrement replacement inventory. Admin must reconcile replacement stock
and returned stock through inventory management before confirming dispatch.

Camera permission configuration changed. Rebuild the native app to apply it to installed
builds. Device QA should cover camera/gallery permission denial, two-photo submissions,
saved/new pickup addresses, rescheduling, admin clarification, refund and exchange.

## Verification

Run `node --test` from `backend` for unit/service regressions. To run the return HTTP and
MongoDB integration test in PowerShell:

```powershell
$env:RETURN_INTEGRATION = '1'
node tests/return-case.integration.test.js
```

It creates and removes a uniquely named test database, covering authorization, private
images, retries, seller isolation/counts, concurrent updates and the refund lifecycle.
Exchange stages and stock rejection are covered by `return-case.test.js`.
Frontend checks use TypeScript and an Expo Android export, plus `frontend/tests` tests.

## Support and payout details

- Drawer > Support opens a full-width Help centre. My requests lists return/exchange
  cases across orders, with latest messages and unread indicators. Order details retain
  a compact entry into the same case. Details and Messages are separate tabs on both sides.
- Messages and proof replies are case-scoped. A normal message does not change the
  fulfilment stage; replying to an information request resumes its previous stage.
  Existing history is visible as conversation updates. Closed conversations are read-only.
- Read acknowledgements are persisted per customer/admin through the observed version,
  so a later message cannot accidentally be marked read. Polling refreshes customer cases
  and inboxes every 15 seconds. This is in-app messaging, not push notifications or sockets.
- Refund creation and exchange-to-refund require UPI ID, or account holder/number/IFSC,
  or the existing cash option. Bank-number confirmation is checked in the client; server
  schemas check field formats, method consistency, ownership and allowed case stages.
  Existing open cases can add/correct missing details from Request details > Refund details.
- Payout destinations use AES-256-GCM with order/case-bound associated data and the existing
  STORE_ENCRYPTION_KEY. Missing configuration fails closed. Lists and case history contain
  only masked summaries, never plaintext destinations. The no-store payout endpoint allows
  only the owner or an admin. Admin uses View payout details; full values stay in component
  memory until hidden or unmounted, not in the shared query cache.
- Recording non-cash completion is blocked when no payout destination is present.
  Message count is bounded so room remains for fulfilment events.

Design references reviewed on 2026-09-16:
- Flipkart Help Centre > order/query > support: https://stories.flipkart.com/get-help-contact-flipkart-support
- Amazon issue-specific support: https://www.aboutamazon.in/news/operations/contact-amazon-india-customer-service
- Meesho item-level requests and COD refund destination collection: https://www.meesho.com/legal/returns,%20refunds%20and%20replacement?embed=true

These public patterns inform the structure; this implementation does not reproduce a
private logged-in screen or adopt those stores' return eligibility and refund timelines.
