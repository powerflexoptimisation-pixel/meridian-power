// app/api/debug/route.js — TEMPORAIRE
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getDataCoverage } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const country = new URL(request.url).searchParams.get("country") || "DE";

  const dbUrl = process.env.DATABASE_URL || "";
  const dbHost = dbUrl.match(/@([^/]+)\//)?.[1] || "unknown";

  const sql = neon(process.env.DATABASE_URL);
  const inlineResult = await sql`SELECT COUNT(*) AS n FROM market_prices WHERE country = ${country}`;

  const libResult = await getDataCoverage(country);

  return NextResponse.json({
    country,
    db_host: dbHost,
    inlineResult,
    libResult,
  });
}
