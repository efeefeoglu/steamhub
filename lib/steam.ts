import * as cheerio from 'cheerio';
import type { Game } from './schemas';
import { renderSteamPage } from './playwright';

// Steam's store front occasionally rejects non-browser user agents at its edge. The
// API endpoints do not need a logged-in session, but using the same headers as a
// normal store visit avoids those edge responses (which used to surface as a 502).
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const timeout = (ms = 12000) => AbortSignal.timeout(ms);
const STORE_HEADERS = {
  'user-agent': USER_AGENT,
  accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://store.steampowered.com/',
  cookie: 'birthtime=0; lastagecheckage=1-January-1970; mature_content=1',
};

export function assertSteamUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || (url.hostname !== 'store.steampowered.com' && !url.hostname.endsWith('.steampowered.com'))) throw new Error('Only HTTPS Steam Store URLs are supported.');
  if (!url.pathname.startsWith('/category/') && !url.pathname.startsWith('/sale/')) throw new Error('Use a Steam category or sale event URL.');
  return url;
}

export function extractApps(html: string): Array<{ appId: number; name?: string }> {
  const $ = cheerio.load(html); const found = new Map<number, string | undefined>();
  $('[data-ds-appid], [data-app-id], a[href*="/app/"]').each((_, el) => {
    const node = $(el); const raw = node.attr('data-ds-appid') || node.attr('data-app-id') || node.attr('href')?.match(/\/app\/(\d+)/)?.[1];
    if (!raw) return;
    for (const part of raw.split(',')) { const id = Number(part.trim()); if (Number.isInteger(id) && id > 0 && !found.has(id)) found.set(id, node.find('.tab_item_name,.title').first().text().trim() || node.attr('data-ds-itemkey')?.replace(/^App_/, '') || undefined); }
  });
  // Sale pages commonly serialize capsules without rendering links server-side.
  // Search decoded element contents too: application_config attributes are HTML
  // entity encoded and some event templates put JSON inside attributes.
  const serialized = `${html}\n${$.root().text()}\n${$('[data-apps], [data-items], [data-featured]').map((_, el) => Object.values(el.attribs).join(' ')).get().join('\n')}`;
  for (const match of serialized.matchAll(/(?:\\?["'](?:appid|app_id)\\?["']|data-ds-appid)\s*[:=]\s*\\?["']?(\d+)/gi)) { const id = Number(match[1]); if (id > 0 && !found.has(id)) found.set(id, undefined); }
  return [...found].map(([appId, name]) => ({ appId, ...(name && !/^\d+$/.test(name) ? { name } : {}) }));
}

export async function discover(rawUrl: string, country: string, language: string, max: number) {
  const url = assertSteamUrl(rawUrl); url.searchParams.set('cc', country); url.searchParams.set('l', language);
  let response: Response | undefined; let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(url, { headers: STORE_HEADERS, signal: timeout(), cache: 'no-store', redirect: 'follow' });
      if (response.ok || (response.status < 500 && response.status !== 429)) break;
    } catch (error) { failure = error; }
  }
  if (!response) throw new Error(`Steam could not be reached during discovery${failure instanceof Error ? `: ${failure.message}` : '.'}`);
  if (!response.ok) throw new Error(`Steam returned ${response.status} during discovery.`);
  let apps = extractApps(await response.text());
  if (!apps.length) {
    try {
      apps = extractApps(await renderSteamPage(url));
    } catch (error) {
      throw new Error(`Steam's event page required browser rendering, but Playwright failed: ${error instanceof Error ? error.message : 'Unknown browser error.'}`);
    }
  }
  if (!apps.length) throw new Error('No games were found. Steam may be rate-limiting this request or the page may be unsupported.');
  return { games: apps.slice(0, max), total: Math.min(apps.length, max), truncated: apps.length > max };
}

type AppDetails = { success: boolean; data?: { type?: string; name?: string; is_free?: boolean; price_overview?: { currency: string; initial: number; final: number; discount_percent: number }; release_date?: { date?: string } } };
type ReviewData = { query_summary?: { review_score_desc?: string; total_positive?: number; total_negative?: number; total_reviews?: number } };
export async function enrichApp(appId: number, country: string, language: string): Promise<Game | null> {
  const params = new URLSearchParams({ appids: String(appId), cc: country, l: language, filters: 'basic,price_overview,release_date' });
  const reviewParams = new URLSearchParams({ json: '1', language: 'all', purchase_type: 'all', num_per_page: '0' });
  const [detailRes, reviewRes] = await Promise.all([
    fetch(`https://store.steampowered.com/api/appdetails?${params}`, { headers: STORE_HEADERS, signal: timeout(), cache: 'no-store' }),
    fetch(`https://store.steampowered.com/appreviews/${appId}?${reviewParams}`, { headers: STORE_HEADERS, signal: timeout(), cache: 'no-store' }),
  ]);
  if (!detailRes.ok) return null;
  const wrapper = await detailRes.json() as Record<string, AppDetails>; const data = wrapper[String(appId)]?.data;
  if (!data?.name) return null;
  let reviews: ReviewData = {}; if (reviewRes.ok) reviews = await reviewRes.json() as ReviewData;
  const summary = reviews.query_summary; const total = summary?.total_reviews ?? ((summary?.total_positive ?? 0) + (summary?.total_negative ?? 0));
  const positive = summary?.total_positive ?? 0; const price = data.price_overview;
  return { appId, name: data.name, type: data.type ?? 'unknown', reviewRating: summary?.review_score_desc ?? 'No reviews', positivePercent: total ? Math.round(positive / total * 100) : null, totalReviews: total, originalPrice: price?.initial ?? null, currentPrice: price?.final ?? (data.is_free ? 0 : null), currency: price?.currency ?? null, discountPercent: price?.discount_percent ?? 0, releaseDate: data.release_date?.date ?? '—', isFree: Boolean(data.is_free), steamUrl: `https://store.steampowered.com/app/${appId}` };
}
