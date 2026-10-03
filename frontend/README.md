# BookLingo frontend

## Deploy to Netlify

The repository includes a `netlify.toml` configured to build this Vite app from
the `frontend` directory and publish `dist`. Connect the repository to Netlify
and use the default build settings from that file.

In Netlify, add the `VITE_API_URL` environment variable with the public origin
of your deployed backend, for example `https://api.example.com`. Enter only
the origin: do not append `/api` or a trailing slash. Vite embeds this value at
build time, so trigger a new deploy after changing it. The backend must allow
requests from your Netlify site and support credentialed requests.

For local development, set `VITE_API_URL` in an ignored `.env` file to your
backend origin. If it is omitted, the Vite development server proxies `/api`
to `http://localhost:5000`.

## Build locally

```sh
npm install
npm run build
```
