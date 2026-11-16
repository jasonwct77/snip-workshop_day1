# Snip Frontend

The Angular 19 web client for Snip. It shortens HTTP(S) URLs and lists links from
the shared API at `http://localhost:3000`.

## Run locally

```bash
npm install
npx ng serve
```

Open `http://localhost:4200`. The backend must be running on port 3000 with CORS
enabled.

## Build

```bash
npx ng build
```

The production files are written to `dist/snip-frontend/browser`.
