// app/api/consumption-forecast/route.js
// Usage: /api/consumption-forecast?country=DE&from=2026-07-25&to=2026-07-31
// Prévision day-ahead (ENTSO-E A65/A01) vs réalisé (market_load) + précision (MAPE/MAE).

import { NextResponse } from "next/server";
import { getLoadForecastHistory, getLoadHistory } from "../../../lib/db";
import { berlinDateToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      getLoadForecastHistory(country, from, to),
      getLoadHistory(country, from, to),
    ]);

    const forecastByTs = new Map(forecast.map((p) => [p.timestamp, p.load_mw]));
    const actualByTs = new Map(actual.map((p) => [p.timestamp, p.load_mw]));
    const allTs = [...new Set([...forecastByTs.keys(), ...actualByTs.keys()])].sort();

    const merged = allTs.map((ts) => ({
      timestamp: ts,
      forecast: forecastByTs.get(ts) ?? null,
      actual: actualByTs.get(ts) ?? null,
    }));

    const pairs = merged.filter((r) => r.forecast != null && r.actual != null);
    let accuracy = null;
    if (pairs.length > 0) {
      const errors = pairs.map((r) => Math.abs(r.actual - r.forecast));
      const mae = errors.reduce((s, e) => s + e, 0) / errors.length;
      const pctErrors = pairs.map((r) => Math.abs(r.actual - r.forecast) / r.actual);
      const mape = (pctErrors.reduce((s, e) => s + e, 0) / pctErrors.length) * 100;
      accuracy = { mae_mw: mae, mape_pct: mape, n_points: pairs.length };
    }

    return NextResponse.json({ country, from: from.toISOString(), to: to.toISOString(), points: merged, accuracy });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
