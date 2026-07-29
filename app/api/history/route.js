// app/api/history/route.js
// Usage: /api/history?country=DE&days=30
// Retourne: stats quotidiennes de prix (avg/min/max) + couverture des données.

import { NextResponse } from "next/server";
import { DOMAINS } from "../../../lib/entsoe";
import { getDailyPriceStats, getDataCoverage } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get("country") || "").toUpperCase();
  const days = Math.min(Number(searchParams.get("days") || "30"), 365);

  if (!DOMAINS[country]) {
    return NextResponse.json(
      { error: `Marché inconnu. Valeurs acceptées: ${Object.keys(DOMAINS).join(", ")}` },
      { status: 400 }
    );
  }

  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);

  try {
    const [daily, coverage] = await Promise.all([
      getDailyPriceStats(country, from.toISOString(), to.toISOString()),
      getDataCoverage(country),
    ]);
    return NextResponse.json({
      country,
      daily,
      coverage: {
        earliest: coverage.earliest,
        latest: coverage.latest,
        n_points: Number(coverage.n),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
