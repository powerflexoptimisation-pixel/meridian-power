// app/api/history/route.js
// Usage:
//   /api/history?country=DE&days=30
//   /api/history?countries=DE,FR,IT&from=2026-06-01&to=2026-06-30&resolution=day
// - country|countries: un ou plusieurs codes marché (CSV pour countries)
// - days: raccourci "N derniers jours" (ignoré si from/to fournis)
// - from/to: dates YYYY-MM-DD en heure de Berlin, bornes incluses
// - resolution: "day" (défaut) ou "hour" (limité à 90 jours)

import { NextResponse } from "next/server";
import { DOMAINS } from "../../../lib/entsoe";
import { getPriceStatsBucketed, getDataCoverage } from "../../../lib/db";
import { berlinMidnightUTC, berlinDateToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const countriesParam = searchParams.get("countries") || searchParams.get("country") || "";
  const countries = [...new Set(countriesParam.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))];

  if (countries.length === 0) {
    return NextResponse.json(
      { error: `Paramètre country ou countries requis. Valeurs acceptées: ${Object.keys(DOMAINS).join(", ")}` },
      { status: 400 }
    );
  }
  for (const c of countries) {
    if (!DOMAINS[c]) {
      return NextResponse.json({ error: `Marché inconnu: ${c}. Valeurs acceptées: ${Object.keys(DOMAINS).join(", ")}` }, { status: 400 });
    }
  }

  const resolution = searchParams.get("resolution") === "hour" ? "hour" : "day";

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  let from, to;
  if (fromParam && toParam) {
    from = berlinDateToUTC(fromParam);
    to = new Date(berlinDateToUTC(toParam).getTime() + 24 * 3600 * 1000); // 'to' inclusif -> borne exclusive +1j
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ error: "Plage from/to invalide (format attendu: YYYY-MM-DD, from < to)." }, { status: 400 });
    }
  } else {
    const days = Math.min(Math.max(Number(searchParams.get("days") || "30"), 1), 730);
    to = berlinMidnightUTC(0);
    from = berlinMidnightUTC(days);
  }

  if (resolution === "hour" && to.getTime() - from.getTime() > 92 * 24 * 3600 * 1000) {
    return NextResponse.json(
      { error: "Résolution horaire limitée à 90 jours par requête. Utilise resolution=day pour des périodes plus longues." },
      { status: 400 }
    );
  }

  try {
    const markets = {};
    await Promise.all(
      countries.map(async (c) => {
        const [series, coverage] = await Promise.all([
          getPriceStatsBucketed(c, from.toISOString(), to.toISOString(), resolution),
          getDataCoverage(c),
        ]);
        markets[c] = {
          series,
          coverage: { earliest: coverage.earliest, latest: coverage.latest, n_points: Number(coverage.n) },
        };
      })
    );

    return NextResponse.json({
      resolution,
      from: from.toISOString(),
      to: to.toISOString(),
      countries,
      markets,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
