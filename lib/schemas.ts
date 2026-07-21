import { z } from 'zod';

const steamUrl = z.string().url().refine((value) => {
  try { const host = new URL(value).hostname.toLowerCase(); return host === 'store.steampowered.com' || host.endsWith('.steampowered.com'); } catch { return false; }
}, 'Enter a store.steampowered.com URL');

export const discoverRequestSchema = z.object({
  url: steamUrl,
  country: z.string().regex(/^[a-z]{2}$/i).default('tr'),
  language: z.string().regex(/^[a-z-]+$/i).default('english'),
  maxGames: z.number().int().min(1).max(500).default(200),
});
export const discoveredGameSchema = z.object({ appId: z.number().int().positive(), name: z.string().optional() });
export const discoverResponseSchema = z.object({ games: z.array(discoveredGameSchema), total: z.number().int().nonnegative(), truncated: z.boolean() });
export const enrichRequestSchema = z.object({
  appIds: z.array(z.number().int().positive()).min(1).max(25),
  country: z.string().regex(/^[a-z]{2}$/i).default('tr'),
  language: z.string().regex(/^[a-z-]+$/i).default('english'),
  includeDlc: z.boolean().default(false), includeFree: z.boolean().default(true),
});
export const gameSchema = z.object({
  appId: z.number(), name: z.string(), type: z.string(), reviewRating: z.string(),
  positivePercent: z.number().nullable(), totalReviews: z.number(), originalPrice: z.number().nullable(),
  currentPrice: z.number().nullable(), currency: z.string().nullable(), discountPercent: z.number(),
  releaseDate: z.string(), isFree: z.boolean(), steamUrl: z.string().url(),
});
export const enrichResponseSchema = z.object({ games: z.array(gameSchema), skipped: z.number().int().nonnegative() });
export type Game = z.infer<typeof gameSchema>;
