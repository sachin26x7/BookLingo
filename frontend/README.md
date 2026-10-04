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
3. Set `NODE_ENV=production`. Set `FRONTEND_URL` to the public Railway URL if
   cross-origin frontend access is needed. When using the included
   single-domain frontend, no `VITE_API_URL` is required; the frontend calls
   `/api` on the same host.
4. Add the email provider variables (`RESEND_API_KEY` and `EMAIL_FROM`, or
   `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, and optionally
   `EMAIL_FROM`) to enable verification and password-reset email.
5. Add a Railway volume mounted at `/app/backend/uploads` and set
   `UPLOAD_DIR=/app/backend/uploads` so uploaded PDFs survive redeploys.
   Configure any optional AI integration with `GROQ_API_KEY`.
6. Generate a public domain for the service, then redeploy after changing
   variables or volume settings.

Railway environment variables must be configured in its dashboard; do not
commit secrets or copy local `.env` files into the deployment. MongoDB must be
reachable from the Railway service. Redis is optional and can be configured
with `REDIS_URL`.

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
