import * as cheerio from 'cheerio';
import type { Game } from './schemas';

const USER_AGENT = 'SteamScout/1.0 (+https://vercel.com; game catalog research)';
const timeout = (ms = 12000) => AbortSignal.timeout(ms);

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
  for (const match of html.matchAll(/(?:"appid"|"app_id"|data-ds-appid)\s*[:=]\s*["']?(\d+)/gi)) { const id = Number(match[1]); if (id > 0 && !found.has(id)) found.set(id, undefined); }
  return [...found].map(([appId, name]) => ({ appId, ...(name && !/^\d+$/.test(name) ? { name } : {}) }));
}

export async function discover(rawUrl: string, country: string, language: string, max: number) {
  const url = assertSteamUrl(rawUrl); url.searchParams.set('cc', country); url.searchParams.set('l', language);
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml', cookie: 'birthtime=0; lastagecheckage=1-January-1970' }, signal: timeout(), cache: 'no-store' });
  if (!response.ok) throw new Error(`Steam returned ${response.status} during discovery.`);
  const apps = extractApps(await response.text());
  if (!apps.length) throw new Error('No games were found. Steam may be rate-limiting this request or the page may be unsupported.');
  return { games: apps.slice(0, max), total: Math.min(apps.length, max), truncated: apps.length > max };
}

type AppDetails = { success: boolean; data?: { type?: string; name?: string; is_free?: boolean; price_overview?: { currency: string; initial: number; final: number; discount_percent: number }; release_date?: { date?: string } } };
type ReviewData = { query_summary?: { review_score_desc?: string; total_positive?: number; total_negative?: number; total_reviews?: number } };
export async function enrichApp(appId: number, country: string, language: string): Promise<Game | null> {
  const params = new URLSearchParams({ appids: String(appId), cc: country, l: language, filters: 'basic,price_overview,release_date' });
  const reviewParams = new URLSearchParams({ json: '1', language: 'all', purchase_type: 'all', num_per_page: '0' });
  const [detailRes, reviewRes] = await Promise.all([
    fetch(`https://store.steampowered.com/api/appdetails?${params}`, { headers: { 'user-agent': USER_AGENT }, signal: timeout(), cache: 'no-store' }),
    fetch(`https://store.steampowered.com/appreviews/${appId}?${reviewParams}`, { headers: { 'user-agent': USER_AGENT }, signal: timeout(), cache: 'no-store' }),
  ]);
  if (!detailRes.ok) return null;
  const wrapper = await detailRes.json() as Record<string, AppDetails>; const data = wrapper[String(appId)]?.data;
  if (!data?.name) return null;
  let reviews: ReviewData = {}; if (reviewRes.ok) reviews = await reviewRes.json() as ReviewData;
  const summary = reviews.query_summary; const total = summary?.total_reviews ?? ((summary?.total_positive ?? 0) + (summary?.total_negative ?? 0));
  const positive = summary?.total_positive ?? 0; const price = data.price_overview;
  return { appId, name: data.name, type: data.type ?? 'unknown', reviewRating: summary?.review_score_desc ?? 'No reviews', positivePercent: total ? Math.round(positive / total * 100) : null, totalReviews: total, originalPrice: price?.initial ?? null, currentPrice: price?.final ?? (data.is_free ? 0 : null), currency: price?.currency ?? null, discountPercent: price?.discount_percent ?? 0, releaseDate: data.release_date?.date ?? '—', isFree: Boolean(data.is_free), steamUrl: `https://store.steampowered.com/app/${appId}` };
}
