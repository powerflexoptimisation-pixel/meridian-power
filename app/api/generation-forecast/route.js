// app/api/generation-forecast/route.js
// Usage: /api/generation-forecast?country=DE&from=2026-07-25&to=2026-07-31
// Renvoie prévision day-ahead (ENTSO-E A69) ET réalisé (market_generation,
// déjà persisté) pour Solar/Wind Onshore/Wind Offshore sur la période, plus
// une précision agrégée (MAPE/MAE) par filière.

import { NextResponse } from "next/server";
import { getWindSolarForecastHistory, getGenerationHistory } from "../../../lib/db";
import { berlinDateToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FUELS = ["Solar", "Wind Onshore", "Wind Offshore"];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || "DE";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  let from, to;
  if (fromParam && toParam) {
    from = berlinDateToUTC(fromParam);
    to = new Date(berlinDateToUTC(toParam).getTime() + 24 * 3600 * 1000);
  } else {
    to = new Date();
    from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  }

  try {
    const [forecast, actual] = await Promise.all([
      getWindSolarForecastHistory(country, from, to),
      getGenerationHistory(country, from, to),
    ]);

    const forecastByTs = new Map(forecast.map((p) => [p.timestamp, p]));
    const actualByTs = new Map(actual.map((p) => [p.timestamp, p]));
    const allTs = [...new Set([...forecastByTs.keys(), ...actualByTs.keys()])].sort();

    const merged = allTs.map((ts) => {
      const f = forecastByTs.get(ts) || {};
      const a = actualByTs.get(ts) || {};
      const row = { timestamp: ts };
      for (const fuel of FUELS) {
        row[`${fuel}_forecast`] = f[fuel] ?? null;
        row[`${fuel}_actual`] = a[fuel] ?? null;
      }
      return row;
    });

    const accuracy = {};
    for (const fuel of FUELS) {
      const pairs = merged.filter((r) => r[`${fuel}_forecast`] != null && r[`${fuel}_actual`] != null);
      if (pairs.length === 0) { accuracy[fuel] = null; continue; }
      const errors = pairs.map((r) => Math.abs(r[`${fuel}_actual`] - r[`${fuel}_forecast`]));
      const mae = errors.reduce((s, e) => s + e, 0) / errors.length;
      const actualAvg = pairs.reduce((s, r) => s + r[`${fuel}_actual`], 0) / pairs.length;
      const pctErrors = pairs
        .filter((r) => r[`${fuel}_actual`] > 50) // évite les divisions par ~0 la nuit pour le solaire
        .map((r) => Math.abs(r[`${fuel}_actual`] - r[`${fuel}_forecast`]) / r[`${fuel}_actual`]);
      const mape = pctErrors.length ? (pctErrors.reduce((s, e) => s + e, 0) / pctErrors.length) * 100 : null;
      accuracy[fuel] = { mae_mw: mae, mape_pct: mape, n_points: pairs.length, actual_avg_mw: actualAvg };
    }

    return NextResponse.json({ country, from: from.toISOString(), to: to.toISOString(), points: merged, accuracy });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
