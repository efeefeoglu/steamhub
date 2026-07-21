# Steam Scout

A serverless-friendly Next.js app that discovers games on Steam category and sale-event pages, enriches them with localized prices and aggregate reviews, and exports the results in CSV or JSON.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Node.js 18.18 or newer is required.

## Architecture

1. `POST /api/steam/discover` validates and fetches an HTTPS Steam category or sale URL, then extracts unique app IDs from HTML attributes, links, and embedded JSON.
2. The browser divides IDs into batches of 20 and calls `POST /api/steam/enrich`. The endpoint accepts at most 25 IDs and combines Steam App Details with Review Summary data.
3. Filtering, sorting, and file generation happen in the browser. Nothing is written to disk.

Both API routes explicitly use the Node.js runtime, disable caching, impose upstream timeouts, and fit Vercel's stateless request model. A browser fallback is intentionally not required: supported Steam pages expose identifiers in their response markup and the public JSON endpoints provide enrichment.

## API

### Discover

```json
POST /api/steam/discover
{"url":"https://store.steampowered.com/category/trains","country":"tr","language":"english","maxGames":200}
```

### Enrich

```json
POST /api/steam/enrich
{"appIds":[24010,588030],"country":"tr","language":"english","includeDlc":false,"includeFree":true}
```

## Deploy

Import this repository into Vercel. The framework and build command are detected automatically; no environment variables or persistent storage are required.
