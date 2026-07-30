// app/api/debug/route.js — TEMPORAIRE, à supprimer après diagnostic
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = neon(process.env.DATABASE_URL);
  const prices = await sql`SELECT country, COUNT(*) AS n, MIN(ts) AS min_ts, MAX(ts) AS max_ts FROM market_prices GROUP BY country`;
  const gen = await sql`SELECT country, COUNT(*) AS n FROM market_generation GROUP BY country`;
  const logs = await sql`SELECT * FROM collection_log ORDER BY ran_at DESC LIMIT 10`;
  return NextResponse.json({ prices, gen, logs });
}
