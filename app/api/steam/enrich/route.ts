import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { enrichRequestSchema, enrichResponseSchema } from '@/lib/schemas';
import { enrichApp } from '@/lib/steam';
export const runtime = 'nodejs'; export const maxDuration = 30; export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try { const input = enrichRequestSchema.parse(await request.json()); const settled = await Promise.all(input.appIds.map(id => enrichApp(id, input.country, input.language).catch(() => null))); const valid = settled.filter((g): g is NonNullable<typeof g> => Boolean(g)); const games = valid.filter(g => (input.includeDlc || g.type !== 'dlc') && (input.includeFree || !g.isFree)); return NextResponse.json(enrichResponseSchema.parse({ games, skipped: input.appIds.length - games.length })); }
  catch (error) { const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : 'Enrichment failed.'; return NextResponse.json({ error: message }, { status: error instanceof ZodError ? 400 : 502 }); }
}
