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

  // Trouver la vraie ligne avec le prix max
  const maxRow = await sql`
    SELECT ts, price_eur_mwh FROM market_prices WHERE country = ${country}
    ORDER BY price_eur_mwh DESC LIMIT 5
  `;

  // Timezone de la session Postgres
  const tz = await sql`SHOW timezone`;

  // Reproduction exacte de getDailyPriceStats pour la fenêtre autour du 24 juin
  const dailyRepro = await sql`
    SELECT date_trunc('day', ts) AS day, AVG(price_eur_mwh) AS avg_price,
           MIN(price_eur_mwh) AS min_price, MAX(price_eur_mwh) AS max_price, COUNT(*) as n
    FROM market_prices
    WHERE country = ${country} AND ts >= '2026-06-22T00:00:00Z' AND ts < '2026-06-26T00:00:00Z'
    GROUP BY day ORDER BY day
  `;

  return NextResponse.json({ country, maxRow, tz, dailyRepro });
}
