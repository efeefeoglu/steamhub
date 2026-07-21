import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { discoverRequestSchema, discoverResponseSchema } from '@/lib/schemas';
import { discover } from '@/lib/steam';
export const runtime = 'nodejs'; export const maxDuration = 30; export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try { const input = discoverRequestSchema.parse(await request.json()); return NextResponse.json(discoverResponseSchema.parse(await discover(input.url, input.country, input.language, input.maxGames))); }
  catch (error) { const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : 'Discovery failed.'; return NextResponse.json({ error: message }, { status: error instanceof ZodError ? 400 : 502 }); }
}
