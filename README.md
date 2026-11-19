# Pizza Delivery

Full-stack pizza ordering app with a React/Vite frontend, Express/MongoDB API, cookie-based authentication, Razorpay checkout, order tracking, admin tools, and ingredient inventory.

## Local setup

Requirements: Node.js, npm, and MongoDB.

1. Install dependencies:

   ```powershell
   npm --prefix backend install
   npm --prefix frontend install
   ```

2. Configure the backend:

   ```powershell
   if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
   ```

   If `backend\.env` already exists, keep it and update only the missing settings; do not overwrite it with the example. Set a unique `JWT_SECRET` of at least 32 characters. Razorpay and email settings are optional for development, but payments and email notifications require their respective credentials. Keep credentials local; do not commit or share them.

   `backend\.env.example` is only a template; the server loads `backend\.env`. There is no root `.env` requirement. Set `VITE_API_URL` in the frontend hosting environment to the absolute backend API URL, such as `https://api.example.com/api`.

   The backend development command enables a local-only email verification link and displays a reset OTP when SMTP is not configured. This fallback is available only through `npm run dev`; production requires email delivery and never returns verification or reset secrets in API responses. After a valid reset OTP, the server creates a 10-minute password-reset session in an HttpOnly, SameSite=Lax cookie scoped to the reset endpoint. The browser never receives or submits the reset token; the reset request contains only the new and confirmation passwords.

3. Start MongoDB, then run the backend and frontend in separate terminals:

   ```powershell
   npm --prefix backend run dev
   npm --prefix frontend run dev
   ```

   Open the Vite URL printed in the frontend terminal (normally `http://localhost:5173`; if that port is occupied, the development backend also allows Vite's `http://localhost:5174` fallback).

4. To add the sample menu without changing existing products, run:

   ```powershell
   npm --prefix backend run seed:menu
   ```

   The seed script adds only missing sample pizza names. It can be run again safely; existing products, users, and orders are left untouched.

   To populate the four-step custom pizza builder with its sample bases, sauces, cheeses, and vegetables, run:

   ```powershell
   npm --prefix backend run seed:builder
   ```

   To migrate the seeded menu records from their old remote image URLs to the local images in `backend\uploads\pizzas`, run:

   ```powershell
   npm --prefix backend run migrate:images
   ```

   The builder seed preserves existing stock for matching ingredients while updating their category and price.

## Admin setup

### Option 1: Seed a default administrator account (Quickest)

Run the admin seed script to create or update the default administrator:

```powershell
npm --prefix backend run seed:admin
```

This creates an administrator account:
- **Email**: `admin@example.com` (or the email configured as `ADMIN_EMAIL` in `backend\.env`)
- **Password**: `Admin@12345`

### Option 2: Promote an existing registered account

Register and verify an account through the app first, then grant it admin rights:

```powershell
node backend\scripts\promoteAdmin.js user@example.com
```

### Logging into the Admin Dashboard

1. Navigate to `http://localhost:5173/admin/login` (the dedicated admin sign-in portal).
2. Enter your administrator email and password.
3. Upon authentication, you will be redirected to `http://localhost:5173/admin`.
4. The admin dashboard provides tools for:
   - Order management and live status transitions
   - Categorized inventory (Bases, Sauces, Cheeses, Vegetables) and stock adjustments
   - Menu pizza management and low-stock threshold configuration

## Payments

Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to Razorpay **test-mode** credentials in `backend\.env` to enable checkout. The backend rejects key IDs that are not test-mode IDs. Checkout verification checks the Razorpay signature and fetches the payment from Razorpay; only a captured payment matching the stored order ID, INR currency, and database-calculated amount can fulfill the order.

For webhook updates, configure a publicly reachable HTTPS endpoint at `https://<your-api-host>/api/payments/webhook` and subscribe to `payment.captured` and `payment.failed`. Set the Razorpay webhook signing secret as `RAZORPAY_WEBHOOK_SECRET` in `backend\.env`. The endpoint verifies the signature against the raw request body and retains compact event-ID records indefinitely so an old replay cannot bypass deduplication. Failed or cancelled checkout attempts remain unpaid and can be retried. Never use live credentials when testing.

When a verified payment cannot be fulfilled due to stock or because the order was cancelled, the backend attempts a refund with a stable receipt, reconciles delayed results against Razorpay, and makes a new attempt only after the provider confirms the previous attempt failed. After three confirmed failures, the order is marked `refund_failed` for support follow-up.

### Recovering interrupted inventory processing

After MongoDB connects, the backend scans for orders with an expired `stockProcessing` lease every 30 seconds. A lease is eligible for recovery after two minutes. Recovery atomically claims the order with a new token; completion updates the order state and inventory within the same MongoDB transaction. If a transaction did not commit, its inventory changes roll back and recovery can retry. If it committed, the order's `stockDeducted` state prevents a second deduction. Cancellation restores stock only while that state is true, and clears it in the same transaction as the restoration.

The lease identifies abandoned work but is not the idempotency guarantee: the transaction and persisted stock state prevent duplicate inventory changes, while the token fences off stale workers. Older records with `stockProcessing: true` but no processing timestamp or a state that cannot be safely interpreted require manual reconciliation; recovery does not guess whether their inventory was already changed.

## Feature coverage

- Customer accounts use email verification, HttpOnly cookie authentication, and email OTP password reset.
- The menu supports search and category filtering. Customers can customize pizza size, crust, and toppings, edit cart items, and submit idempotent orders.
- Customers can build a custom pizza by selecting a base, sauce, cheese, and vegetables; ingredient prices are calculated from the server-validated selections.
- Razorpay test-mode checkout verifies payment signatures on the server. Order updates are sent to authenticated customers in real time, with a progress tracker on the order details page.
- Administrators use the separate `/admin/login` page; the backend rejects non-admin accounts at the admin login endpoint. The dashboard summarizes inventory by pizza bases, sauces, cheeses, and vegetables, and supports categorized ingredient pricing and stock management.
- Admins can manage pizzas, order statuses, refunds, and ingredient inventory. Stock is deducted only after payment verification.
- Registration, login, verification-email resend, reset-code request, OTP verification, and password reset submission have per-IP rate limits. Passwords must be at least 10 characters and contain uppercase, lowercase, and numeric characters.

## API reference

## Production hosting

The repository includes [netlify.toml](./netlify.toml) for the Vite frontend and [render.yaml](./render.yaml) for the Express backend. The recommended production layout is:

- Netlify for `frontend/`
- Render for `backend/`
- MongoDB Atlas for the production database
- Cloudinary, Cloudflare R2, or Amazon S3 for administrator-uploaded images

### Before pushing to GitHub

Never commit `backend/.env`. Rotate any credential that has been exposed, then create fresh production values for `JWT_SECRET`, the Gmail app password, and Razorpay credentials. Keep all secrets in the hosting provider's environment-variable settings.

The current backend writes uploaded images to `backend/uploads/pizzas`. This works for the seeded images, but most cloud web-service filesystems are ephemeral. Configure persistent object storage before relying on admin-uploaded images in production.

### Deploy the backend

1. Create a MongoDB Atlas cluster and database user. Copy its connection string; Atlas provides the replica-set support required by payment and inventory transactions.
2. Create a Render Web Service from the GitHub repository, or use the included `render.yaml` Blueprint.
3. If configuring the service manually, set root directory to `backend`, build command to `npm ci`, and start command to `npm start`. Use `/api/health` as the health-check path.
4. Add the variables listed in `backend/.env.example`. Set `NODE_ENV=production`, `TRUST_PROXY=1`, the Atlas `MONGODB_URI`, and a temporary frontend URL until Netlify is ready.
5. Confirm `https://<backend-host>/api/health` returns a successful JSON response.

### Deploy the frontend

1. Create a Netlify site from the same GitHub repository.
2. Use `frontend` as the base directory. The included Netlify configuration builds with `npm run build` and publishes `dist`.
3. Add `VITE_API_URL=https://<backend-host>/api` as a Netlify environment variable, then deploy.
4. Copy the final Netlify URL into the backend's `FRONTEND_URL` variable and redeploy the backend. It must be the exact origin without a trailing slash.

### Finish production setup

1. Run `npm --prefix backend run seed:menu`, `npm --prefix backend run seed:builder`, and `npm --prefix backend run seed:admin` against the production database from a trusted local terminal.
2. Change the seeded administrator password immediately.
3. Set the Razorpay webhook URL to `https://<backend-host>/api/payments/webhook` and configure the matching `RAZORPAY_WEBHOOK_SECRET`.
4. Test registration, email verification, login/logout, menu images, admin upload, checkout, webhook delivery, order tracking, and a direct refresh of routes such as `/menu` and `/admin`.

All routes are prefixed with `/api`. Routes marked **signed-in** require the authentication cookie; **admin** routes also require an admin account.

| Area | Method and path | Access |
| --- | --- | --- |
| Health | `GET /api/health` | Public |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/admin-login`, `POST /auth/logout` | Public; admin login only accepts admin accounts |
| Auth | `GET /auth/me` | Signed-in |
| Auth | `GET /auth/verify-email?token=...`, `POST /auth/resend-verification` | Public |
| Password reset | `POST /auth/forgot-password`, `POST /auth/verify-reset-otp`, `POST /auth/reset-password` | Public; reset requires the verified reset-session cookie |
| Pizzas | `GET /pizzas`, `GET /pizzas/:id` | Public |
| Pizza builder | `GET /builder/options` | Public |
| Pizza management | `POST /pizzas`, `PATCH /pizzas/:id`, `DELETE /pizzas/:id` | Admin |
| Orders | `POST /orders`, `GET /orders/my-orders`, `GET /orders/:id` | Signed-in |
| Payments | `POST /payments/create-order`, `POST /payments/verify` | Signed-in |
| Payments | `POST /payments/webhook` | Public; requires a valid Razorpay webhook signature |
| Admin dashboard | `GET /admin/dashboard`, `GET /admin/orders`, `PATCH /admin/orders/:id/status` | Admin |
| Inventory | `GET /admin/inventory`, `POST /admin/inventory`, `PATCH /admin/inventory/:id` | Admin |

## Deployment notes

- The default rate-limit store is in process memory. Use a shared store when running multiple backend instances. Set `TRUST_PROXY` to the number of trusted proxy hops only when deploying behind a reverse proxy; leave it at `0` for local development.
- Payment fulfillment, cancellation, and recovery use MongoDB transactions and therefore require a replica-set or sharded deployment. Other inventory updates retain the compensating-update fallback for a standalone local MongoDB server.
- Payment checkout cannot be tested until Razorpay test credentials are configured locally. Never put secrets in frontend variables or commit them.
- Product images are stored in `backend/uploads/pizzas` and served from `/uploads/pizzas/...`. Admins upload images from the dashboard; image URLs are no longer required in the menu form.

## Checks

```powershell
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend run lint
```
