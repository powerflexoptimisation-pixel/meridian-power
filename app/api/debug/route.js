// app/api/debug/route.js — TEMPORAIRE
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
  const sql = neon(process.env.DATABASE_URL);

  const de = await sql`SELECT ts, price_eur_mwh FROM market_prices WHERE country='DE' AND ts >= '2026-07-29T22:00:00Z' AND ts < '2026-07-30T22:00:00Z' ORDER BY ts`;
  const fr = await sql`SELECT ts, price_eur_mwh FROM market_prices WHERE country='FR' AND ts >= '2026-07-29T22:00:00Z' AND ts < '2026-07-30T22:00:00Z' ORDER BY ts`;

  let matches = 0, diffs = 0;
  const diffSample = [];
  for (let i = 0; i < Math.min(de.length, fr.length); i++) {
    if (de[i].price_eur_mwh === fr[i].price_eur_mwh) matches++;
    else { diffs++; if (diffSample.length < 5) diffSample.push({ts: de[i].ts, de: de[i].price_eur_mwh, fr: fr[i].price_eur_mwh}); }
  }

  return NextResponse.json({ de_count: de.length, fr_count: fr.length, matches, diffs, diffSample });
}
