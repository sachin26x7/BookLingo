# BookLingo

BookLingo is a PDF reader and language-learning app. The frontend is a Vite
application and the backend is an Express API. In production, the backend
serves the built frontend so the app and API share one Railway domain.

## Deploy on Railway

1. Create a Railway project from this GitHub repository and deploy the
   repository root as one service. The root `railway.json` builds both apps,
   starts the API, and configures `/health` as the health check.
2. Add the backend environment variables in the Railway service settings:
   `MONGODB_URI`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` are required.
   The JWT secrets must be different, random, and at least 32 bytes.
3. Set `NODE_ENV=production`. Set `FRONTEND_URL` (or comma-separated
   `FRONTEND_URLS`) to the exact public frontend origin if cross-origin frontend
   access is needed. When using the included
   single-domain frontend, no `VITE_API_URL` is required; the frontend calls
   `/api` on the same host.
4. Configure email on the backend service. For Render, use Resend's HTTP API:
   set `RESEND_API_KEY` and `RESEND_FROM` (for example,
   `BookLingo <verify@your-verified-domain.com>`). Verify the sender domain
   with Resend and publish its required DNS records before testing delivery.
   SMTP can instead use `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
   `SMTP_PASS`, and optionally `SMTP_FROM`; use the host and TLS mode specified
   by your SMTP provider. Port 465 requires `SMTP_SECURE=true`; ports 25 and
   587 require `SMTP_SECURE=false`. For example, use port 465 with implicit
   TLS, or port 587 with STARTTLS. Legacy `EMAIL_HOST`, `EMAIL_PORT`,
   `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_SECURE`, and `EMAIL_FROM` names remain
   supported. Do not commit SMTP credentials.
5. Add a Railway volume mounted at `/app/backend/uploads` and set
   `UPLOAD_DIR=/app/backend/uploads` so uploaded PDFs survive redeploys.
   Configure any optional AI integration with `GROQ_API_KEY`.
6. Generate a public domain for the service, then redeploy after changing
   variables or volume settings.

Railway environment variables must be configured in its dashboard; do not
commit secrets or copy local `.env` files into the deployment. MongoDB must be
reachable from the Railway service. Redis is optional and can be configured
with `REDIS_URL`.

### Separate Vercel frontend and Render API

If deploying the frontend to Vercel and the API to Render instead, set
`VITE_API_URL` in the Vercel project to the Render API origin (for example,
`https://your-api.onrender.com`, without `/api`) and redeploy the frontend.
On Render, set `FRONTEND_URLS` to the exact Vercel origin(s), comma-separated
if needed, then redeploy the backend. The API allows the currently configured
BookLingo Vercel deployment URL as well.

`frontend/vercel.json` rewrites direct browser requests such as `/register` to
the Vite app so React Router can render them. For reliable refresh-token
cookies across separate hosts, the backend uses `SameSite=None; Secure` in
production. Browser privacy settings may still block cross-site cookies;
using a custom frontend and API domain under the same parent domain is more
reliable.

For OTP delivery on Render, set either `RESEND_API_KEY` and `RESEND_FROM` or
the SMTP variables above in the backend service's Environment settings, then
redeploy. The sender must belong to a domain verified by your provider. Resend's
test sender can only deliver to verified recipients on the Resend account;
production users require a verified sending domain. Registration persists the
OTP challenge and encrypted email job before responding; a background worker
sends queued mail and retries temporary failures. Check Render logs for
`[OTP] SMTP connection verified`, `[OTP] SMTP transport diagnostic`,
`[OTP] Email provider accepted message`, and `[OTP] Retry attempt scheduled`
to distinguish connectivity, acceptance, and retry outcomes.

## Local development

Run the backend and frontend in separate terminals:

```sh
cd backend
npm ci
npm run dev
```

```sh
cd frontend
npm ci
npm run dev
```

The Vite development server proxies `/api` to `http://localhost:5000` by
default. Set `VITE_API_URL` in an ignored frontend `.env` file only when the
backend is hosted at a different origin.

## Local production build

From the repository root:

```sh
npm ci --prefix frontend
npm run build --prefix frontend
npm ci --prefix backend
npm run build --prefix backend
```

Start the production API with `npm start --prefix backend`. In production mode,
it serves the frontend build and supports client-side routes.
