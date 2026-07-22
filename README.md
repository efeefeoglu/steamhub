# Steam Sale Explorer MVP

A web application that collects game information from Steam category and sale-event pages. Designed for Vercel's stateless serverless environment.

## Features
- Extracts App IDs from Steam category pages (handling lazy loading)
- Fetches pricing (supports regional pricing), ratings, and metadata
- Client-side filtering and sorting
- Export results to JSON
- Serverless-ready design (batching, stateless)

## Tech Stack
- Python 3.12 (FastAPI)
- Playwright (App ID extraction)
- HTTPX (Async requests to Steam API)
- Vercel (Hosting)
- HTML/CSS/JS (Frontend)

## Local Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

2. Run the application:
   ```bash
   uvicorn api.index:app --reload
   ```

3. Open `public/index.html` in your browser (or serve it via a simple HTTP server like `python -m http.server --directory public`).

## Environment Variables
- `BROWSER_WS_ENDPOINT`: (Optional) WebSocket endpoint for a remote browser service (e.g., Browserless.io). If not provided, Playwright attempts to launch a local browser (useful for dev, but requires a remote browser for Vercel's serverless environment since Chromium is too large to bundle).

## Known Limitations & Vercel Deployment
- **Browser Execution:** Vercel functions have strict size limits (50MB) and cannot bundle a full Chromium browser. To use the extraction feature in production, you *must* provide a `BROWSER_WS_ENDPOINT`.
- **Steam Rate Limits:** The `/api/details` endpoint is intentionally limited to 20 App IDs per request and includes small sleep delays to avoid triggering Steam's strict API rate limits.
- **Timeouts:** Vercel free tier limits functions to 10 seconds. The frontend orchestrates the extraction and batching to avoid hitting this limit for large sales.
