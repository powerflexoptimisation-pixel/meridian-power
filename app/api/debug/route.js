// app/api/debug/route.js — TEMPORAIRE
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const country = new URL(request.url).searchParams.get("country") || "DE";
  const sql = neon(process.env.DATABASE_URL);

  const countOnly = await sql`SELECT COUNT(*) AS n FROM market_prices WHERE country = ${country}`;
  const withMinMax = await sql`SELECT MIN(ts) AS earliest, MAX(ts) AS latest, COUNT(*) AS n FROM market_prices WHERE country = ${country}`;
  const noWhere = await sql`SELECT MIN(ts) AS earliest, MAX(ts) AS latest, COUNT(*) AS n FROM market_prices`;
  const minOnly = await sql`SELECT MIN(ts) AS earliest FROM market_prices WHERE country = ${country}`;
  const countAndMinNoAlias = await sql`SELECT COUNT(*), MIN(ts) FROM market_prices WHERE country = ${country}`;

  return NextResponse.json({ country, countOnly, withMinMax, noWhere, minOnly, countAndMinNoAlias });
}
