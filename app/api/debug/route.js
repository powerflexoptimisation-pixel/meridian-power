// app/api/debug/route.js — TEMPORAIRE
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request) {
  const sql = neon(process.env.DATABASE_URL);
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || "DE";
  const day = searchParams.get("day") || "2026-06-24";

  const rows = await sql`
    SELECT ts, price_eur_mwh
    FROM market_prices
    WHERE country = ${country} AND ts >= ${day + "T00:00:00Z"} AND ts < ${day + "T23:59:59Z"}
    ORDER BY ts ASC
  `;

  // check for duplicate timestamps
  const dupCheck = await sql`
    SELECT ts, COUNT(*) as n
    FROM market_prices
    WHERE country = ${country}
    GROUP BY ts
    HAVING COUNT(*) > 1
    LIMIT 10
  `;

  return NextResponse.json({ country, day, n: rows.length, rows, duplicates: dupCheck });
}
