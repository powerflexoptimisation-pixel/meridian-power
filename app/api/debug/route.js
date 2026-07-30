// app/api/debug/route.js — TEMPORAIRE
import { NextResponse } from "next/server";
import { getDailyPriceStats, getDataCoverage } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const country = new URL(request.url).searchParams.get("country") || "DE";
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);

  // Repro exact du pattern de app/api/history/route.js
  const [daily, coverage] = await Promise.all([
    getDailyPriceStats(country, from.toISOString(), to.toISOString()),
    getDataCoverage(country),
  ]);

  // Version séquentielle pour comparer
  const dailySeq = await getDailyPriceStats(country, from.toISOString(), to.toISOString());
  const coverageSeq = await getDataCoverage(country);

  return NextResponse.json({
    country, from: from.toISOString(), to: to.toISOString(),
    parallel: { daily_count: daily.length, coverage },
    sequential: { daily_count: dailySeq.length, coverage: coverageSeq },
  });
}
