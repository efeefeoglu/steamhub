import os
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from playwright.async_api import async_playwright
import urllib.parse
import httpx
from typing import List, Optional

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

import os

# Mount public directory for static files in development
# Note: In Vercel serverless functions, the public directory might not be present alongside the API.
if os.path.isdir("public"):
    app.mount("/public", StaticFiles(directory="public"), name="public")

@app.get("/")
def read_root():
    if os.path.isfile("public/index.html"):
        return FileResponse("public/index.html")
    return {"status": "Frontend served via Vercel Edge Network"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExtractRequest(BaseModel):
    url: str
    max_scrolls: int = 3 # Reduced to avoid hitting 10s Vercel timeouts on free tier

class DetailsRequest(BaseModel):
    app_ids: List[int]
    cc: str = "tr"  # Country code for pricing, default Türkiye
    include_dlc: bool = False
    include_free: bool = True

from functools import lru_cache
import time

# Simple short term cache for detail responses to avoid redundant external calls
_cache = {}
CACHE_TTL = 300 # 5 minutes

def get_from_cache(key: str):
    if key in _cache:
        data, timestamp = _cache[key]
        if time.time() - timestamp < CACHE_TTL:
            return data
    return None

def set_cache(key: str, data):
    _cache[key] = (data, time.time())

def is_valid_steam_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ["http", "https"]:
            return False
        if parsed.netloc != "store.steampowered.com":
            return False
        if not (parsed.path.startswith("/category/") or parsed.path.startswith("/sale/")):
            return False
        return True
    except Exception:
        return False

@app.post("/api/extract")
async def extract_appids(req: ExtractRequest):
    if not is_valid_steam_url(req.url):
        raise HTTPException(status_code=400, detail="Invalid Steam URL. Must be a store.steampowered.com category or sale page.")

    browser_ws_endpoint = os.environ.get("BROWSER_WS_ENDPOINT")

    app_ids = set()

    try:
        async with async_playwright() as p:
            if browser_ws_endpoint:
                browser = await p.chromium.connect(browser_ws_endpoint)
            else:
                browser = await p.chromium.launch(headless=True)

            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await context.new_page()

            # Go to the URL
            try:
                await page.goto(req.url, wait_until="domcontentloaded", timeout=20000)
            except Exception as e:
                # Sometimes it times out waiting for load, but DOM is ready enough
                pass

            # Wait a bit for initial react render
            await asyncio.sleep(2)

            last_height = await page.evaluate("document.body.scrollHeight")

            for _ in range(req.max_scrolls):
                # Wait for any network requests to settle somewhat to allow JS to load items
                await page.wait_for_timeout(1000)

                # Extract any visible app ids
                # The steam category pages often use special DOM structures
                # Look for typical item containers that might not have data-ds-appid initially

                # Method 1: standard data-ds-appid
                elements = await page.query_selector_all("[data-ds-appid]")
                for el in elements:
                    appid_str = await el.get_attribute("data-ds-appid")
                    if appid_str:
                        for aid in appid_str.split(","):
                            aid = aid.strip()
                            if aid.isdigit():
                                app_ids.add(int(aid))

                # Method 2: look in links href
                links = await page.query_selector_all("a[href*='/app/']")
                for link in links:
                    href = await link.get_attribute("href")
                    if href:
                        try:
                            # e.g., https://store.steampowered.com/app/12345/Name/
                            parts = href.split('/app/')[1].split('/')
                            if parts and parts[0].isdigit():
                                app_ids.add(int(parts[0]))
                        except Exception:
                            pass

                # Scroll down
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1) # wait for new items to load

                new_height = await page.evaluate("document.body.scrollHeight")
                if new_height == last_height:
                    break
                last_height = new_height

            await browser.close()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract App IDs: {str(e)}")

    return {"app_ids": list(app_ids)}

async def fetch_with_retry(client: httpx.AsyncClient, url: str, params: dict = None, max_retries: int = 3):
    for attempt in range(max_retries):
        try:
            response = await client.get(url, params=params, timeout=10.0)
            response.raise_for_status()
            # Handle rate limiting specifically
            if response.status_code == 429:
                raise Exception("Rate limited")
            return response.json()
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Failed to fetch {url}: {e}")
                return None
            await asyncio.sleep(2 ** attempt)
    return None

@app.post("/api/details")
async def get_app_details(req: DetailsRequest):
    if len(req.app_ids) > 20: # Limit batch size
        raise HTTPException(status_code=400, detail="Batch size too large. Maximum 20 App IDs per request.")

    results = []

    async with httpx.AsyncClient() as client:
        for app_id in req.app_ids:
            # 1. Fetch details
            # We use the appdetails endpoint
            details_url = "https://store.steampowered.com/api/appdetails"
            details_params = {"appids": app_id, "cc": req.cc}

            cache_key_details = f"details_{app_id}_{req.cc}"
            details_data = get_from_cache(cache_key_details)

            if not details_data:
                details_data = await fetch_with_retry(client, details_url, details_params)
                if details_data:
                    set_cache(cache_key_details, details_data)

            if not details_data or str(app_id) not in details_data or not details_data[str(app_id)].get("success"):
                continue # Skip if invalid or missing data

            app_data = details_data[str(app_id)]["data"]

            # Filter logic
            if not req.include_dlc and app_data.get("type") == "dlc":
                continue

            is_free = app_data.get("is_free", False)
            if not req.include_free and is_free:
                continue

            # Basic info
            name = app_data.get("name")
            header_image = app_data.get("header_image")
            release_date = app_data.get("release_date", {}).get("date", "")
            developers = app_data.get("developers", [])
            publishers = app_data.get("publishers", [])

            # Pricing
            price_overview = app_data.get("price_overview", {})
            currency = price_overview.get("currency", "")
            original_price = price_overview.get("initial", 0) / 100.0 if price_overview else 0
            sale_price = price_overview.get("final", 0) / 100.0 if price_overview else 0
            discount_percent = price_overview.get("discount_percent", 0) if price_overview else 0

            if is_free:
                original_price = 0
                sale_price = 0
                discount_percent = 0
                currency = "Free"

            # Metacritic
            metacritic_score = app_data.get("metacritic", {}).get("score")

            # 2. Fetch Reviews
            reviews_url = f"https://store.steampowered.com/appreviews/{app_id}"
            reviews_params = {
                "json": 1,
                "language": "all",
                "purchase_type": "all",
                "num_per_page": 0 # We only need the summary
            }

            cache_key_reviews = f"reviews_{app_id}"
            reviews_data = get_from_cache(cache_key_reviews)

            if not reviews_data:
                reviews_data = await fetch_with_retry(client, reviews_url, reviews_params)
                if reviews_data:
                    set_cache(cache_key_reviews, reviews_data)

            review_desc = ""
            positive_percent = 0
            total_reviews = 0

            if reviews_data and reviews_data.get("success") == 1:
                query_summary = reviews_data.get("query_summary", {})
                review_desc = query_summary.get("review_score_desc", "")
                total_reviews = query_summary.get("total_reviews", 0)
                total_positive = query_summary.get("total_positive", 0)
                if total_reviews > 0:
                    positive_percent = round((total_positive / total_reviews) * 100)

            results.append({
                "app_id": app_id,
                "name": name,
                "url": f"https://store.steampowered.com/app/{app_id}",
                "header_image": header_image,
                "release_date": release_date,
                "developers": ", ".join(developers),
                "publishers": ", ".join(publishers),
                "original_price": original_price,
                "sale_price": sale_price,
                "currency": currency,
                "discount_percent": discount_percent,
                "review_description": review_desc,
                "positive_percent": positive_percent,
                "total_reviews": total_reviews,
                "metacritic_score": metacritic_score
            })

            # Be nice to Steam API (conservative concurrency per specs)
            await asyncio.sleep(0.1)

    return {"games": results}

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
