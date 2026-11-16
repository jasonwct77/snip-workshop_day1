# Snip backend

A zero-dependency Bun URL shortener. Run with `bun start`; the API listens on
port 3000 by default and stores links in memory.

- `POST /api/links` with `{"url":"https://example.com"}` creates a short link.
- `GET /api/links` lists links.
- `GET /:code` redirects to the original URL and increments its hit count.

Set `PORT` to change the listening port, `BASE_URL` to set the short-link
origin, or `RAILWAY_PUBLIC_DOMAIN` as a fallback origin. When `PUBLIC_DIR` is
set, files in that directory are served alongside the API.
