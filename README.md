# Steam Scout

A serverless-friendly Next.js app that discovers games on Steam category and sale-event pages, enriches them with localized prices and aggregate reviews, and exports the results in CSV or JSON.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Node.js 18.18 or newer is required.

## Architecture

1. `POST /api/steam/discover` validates and fetches an HTTPS Steam category or sale URL, then extracts unique app IDs from HTML attributes, links, and embedded JSON. If Steam's initial response contains no games, Playwright renders the page in headless Chromium and discovery retries against the resulting DOM.
2. The browser divides IDs into batches of 20 and calls `POST /api/steam/enrich`. The endpoint accepts at most 25 IDs and combines Steam App Details with Review Summary data.
3. Filtering, sorting, and file generation happen in the browser. Nothing is written to disk.

Both API routes explicitly use the Node.js runtime, disable caching, and impose upstream timeouts. Dynamic event pages are rendered with `playwright-core` and the serverless Chromium build from `@sparticuz/chromium`; this avoids shipping Playwright's unsupported desktop browser bundle in the function.

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

Import this repository into Vercel. The framework and build command are detected automatically; no environment variables, browser download during `postinstall`, or persistent storage are required. The discovery function allows 60 seconds so a cold Chromium start can complete before Vercel terminates it.
