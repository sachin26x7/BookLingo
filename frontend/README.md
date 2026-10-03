# BookLingo frontend

## Deploy to Netlify

The repository-root `netlify.toml` builds this Vite app from the `frontend`
directory, uses Node.js 22, publishes `dist`, and enables SPA route fallback.
Connect the repository to Netlify and use the default build settings from that
file.

In Netlify, add the `VITE_API_URL` environment variable with the public origin
of your deployed backend, for example `https://api.example.com`. Enter only
the origin: do not append `/api` or a trailing slash. Vite embeds this value at
build time, so trigger a new deploy after changing it. The backend must allow
requests from your Netlify site and support credentialed requests. BookLingo
stores its refresh token in a `SameSite=Strict` cookie, so the frontend and
backend must also use HTTPS hosts on the same site (for example,
`app.example.com` and `api.example.com`). The default `*.netlify.app` domain
and an unrelated backend domain are not same-site; use a custom Netlify domain
under the same parent domain as the backend.

Configure email on the deployed backend, not in Netlify. OTP delivery uses
Resend when `RESEND_API_KEY` is set (with `EMAIL_FROM` set to a verified sender).
Otherwise it uses SMTP with `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`,
`EMAIL_PASS`, and optionally `EMAIL_FROM`. SMTP must be enabled and reachable
from the backend host; for Gmail, use an app password. These are backend
environment variables and should not be exposed as frontend `VITE_` variables.

For local development, set `VITE_API_URL` in an ignored `.env` file to your
backend origin. If it is omitted, the Vite development server proxies `/api`
to `http://localhost:5000`.

## Build locally

```sh
npm ci
npm run build
```
