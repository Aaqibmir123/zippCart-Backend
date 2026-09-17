# ZippCart code map

## Backend

- `src/admin/`: admin routes, store review controllers, services, repository and validation.
- `src/seller/`: store registration and seller session routes, controllers, services, repository and validation.
- `src/user/`: customer profile, cart, addresses, orders and favorites; each has its own layer folders.
- `src/shared/`: authentication, account roles, OTP and shared account/store models.
- `src/config/`, `src/middlewares/`, `src/utils/`: common infrastructure.
- `src/app.js`: connects the separate routers and dependencies.

Each area uses `routes/`, `controllers/`, `services/`, `repositories/`, `validators/` and `models/` where it owns those responsibilities. Routes contain HTTP wiring; services hold business rules; repositories perform database operations.

An admin and seller are roles on the same user account, so there are no duplicate Admin or Seller account collections. `shared/models/user.model.js` is the single phone identity. `shared/models/store.model.js` is used by seller registration and admin review. Customer-only data models stay in `user/models/`.

Existing API paths remain unchanged: `/api/v1/auth`, `/api/v1/admin`, `/api/v1/seller`, `/api/v1/stores`, `/api/v1/profile`, `/api/v1/cart`, `/api/v1/orders`, `/api/v1/addresses`, `/api/v1/favorites`.

## Frontend

- `navigation/admin/` and `features/admin/stores/`: admin navigation and requests/dashboard UI.
- `screens/seller/` and `features/seller/`: seller access screen and UI preview.
- `navigation/user/`, `screens/user/`, `features/user/store-registration/`: customer shopping and store application UI.
- `navigation/RootNavigator.tsx`: chooses the role/mode navigation.
- `context/`, `services/`, `components/`, `theme/`: shared session, API, reusable UI and styling.

Seller product/order changes are local UI previews. No seller commerce backend was added by this reorganisation.

## Local OTP troubleshooting

1. Run `npm run dev` inside `backend`; wait for MongoDB connection and the API listening message.
2. Set `frontend/.env.local` `EXPO_PUBLIC_API_URL` to `http://<current-laptop-Wi-Fi-IP>:4000/api/v1`. DHCP can change this address.
3. Restart Expo using `npm start -- --lan` inside `frontend`; connect the phone to the same reachable network and scan the current QR code.
4. Open `http://<current-laptop-Wi-Fi-IP>:4000/health` on the phone to check connectivity.
5. Request an OTP and read the latest `[LOCAL OTP]` line in the backend terminal. The verification screen confirms local testing mode; no SMS is sent. When Codex starts the local API in the background, use `Get-Content backend/.local/api.stdout.log -Tail 10 -Wait` from the project root instead.
6. Local delivery defaults to `OTP_DELIVERY=console` and is blocked in production. `OTP_DELIVERY=disabled` also blocks issuing and verifying codes.

Example LAN IPs in release validation tests are test inputs, not runtime settings. Do not change those tests when Wi-Fi changes.
