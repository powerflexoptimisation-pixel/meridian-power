// app/api/history/route.js
// Usage: /api/history?country=DE&days=30
// Retourne: stats quotidiennes de prix (avg/min/max) + couverture des données.

import { NextResponse } from "next/server";
import { DOMAINS } from "../../../lib/entsoe";
import { getDailyPriceStats, getDataCoverage } from "../../../lib/db";
import { berlinMidnightUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

  // Journée de marché en heure de Berlin (CET/CEST), pas en UTC.
  const to = berlinMidnightUTC(0);
  const from = berlinMidnightUTC(days);

  try {
    const coverage = await getDataCoverage(country);
    const daily = await getDailyPriceStats(country, from.toISOString(), to.toISOString());
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
