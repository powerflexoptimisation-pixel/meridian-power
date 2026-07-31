// app/api/history/route.js
import { NextResponse } from "next/server";
import { DOMAINS } from "../../../lib/entsoe";
import { getDailyPriceStats, getDataCoverage } from "../../../lib/db";

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

  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);

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
      _debug: {
        now: now.toISOString(),
        from: from.toISOString(),
        to: to.toISOString(),
        raw_coverage: coverage,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err), stack: err.stack }, { status: 502 });
  }
}
