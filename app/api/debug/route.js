// app/api/debug/route.js — TEMPORAIRE
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const sql = neon(process.env.DATABASE_URL);
  const country = new URL(request.url).searchParams.get("country") || "DE";

  const unfiltered = await sql`SELECT country, COUNT(*) AS n FROM market_prices GROUP BY country`;
  const filtered = await sql`SELECT COUNT(*) AS n FROM market_prices WHERE country = ${country}`;
  const filteredExplicit = await sql`SELECT COUNT(*) AS n FROM market_prices WHERE country = 'DE'`;
  const sampleRows = await sql`SELECT country, length(country) AS len, ts FROM market_prices LIMIT 3`;

  return NextResponse.json({ country_param: country, unfiltered, filtered, filteredExplicit, sampleRows });
}
