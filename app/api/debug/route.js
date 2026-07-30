// app/api/debug/route.js — TEMPORAIRE
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getDataCoverage } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Copie locale exacte de getDataCoverage, sans passer par l'import
async function getDataCoverageLocal(country) {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT MIN(ts) AS earliest, MAX(ts) AS latest, COUNT(*) AS n
    FROM market_prices
    WHERE country = ${country}
  `;
  return rows[0];
}

export async function GET(request) {
  const country = new URL(request.url).searchParams.get("country") || "DE";

  const imported = await getDataCoverage(country);
  const local = await getDataCoverageLocal(country);

  return NextResponse.json({
    country,
    country_type: typeof country,
    country_json: JSON.stringify(country),
    imported,
    local,
  });
}
