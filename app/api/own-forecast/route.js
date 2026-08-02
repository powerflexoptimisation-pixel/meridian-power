// app/api/own-forecast/route.js
// Usage: /api/own-forecast?from=2026-07-25&to=2026-08-02
// Fusionne notre prévision maison, la prévision ENTSO-E, et le réalisé,
// pour Wind Onshore/Offshore/Solar (DE uniquement pour l'instant).

import { NextResponse } from "next/server";
import { getOwnForecastHistory, getWindSolarForecastHistory, getGenerationHistory, getForecastModel } from "../../../lib/db";
import { berlinDateToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FUELS = ["Wind Onshore", "Wind Offshore", "Solar"];
const COUNTRY = "DE";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  let from, to;
  if (fromParam && toParam) {
    from = berlinDateToUTC(fromParam);
    to = new Date(berlinDateToUTC(toParam).getTime() + 24 * 3600 * 1000);
  } else {
    from = new Date(Date.now() - 24 * 3600 * 1000);
    to = new Date(Date.now() + 6 * 24 * 3600 * 1000);
  }

  try {
    const [ownForecast, entsoeForecast, actual, models] = await Promise.all([
      getOwnForecastHistory(COUNTRY, from, to),
      getWindSolarForecastHistory(COUNTRY, from, to),
      getGenerationHistory(COUNTRY, from, to),
      Promise.all(FUELS.map((f) => getForecastModel(COUNTRY, f))),
    ]);

    const ownByTs = new Map(ownForecast.map((p) => [p.timestamp, p]));
    const entsoeByTs = new Map(entsoeForecast.map((p) => [p.timestamp, p]));
    const actualByTs = new Map(actual.map((p) => [p.timestamp, p]));
    const allTs = [...new Set([...ownByTs.keys(), ...entsoeByTs.keys(), ...actualByTs.keys()])].sort();

    const merged = allTs.map((ts) => {
      const own = ownByTs.get(ts) || {};
      const entsoe = entsoeByTs.get(ts) || {};
      const act = actualByTs.get(ts) || {};
      const row = { timestamp: ts };
      for (const fuel of FUELS) {
        row[`${fuel}_own`] = own[fuel] ?? null;
        row[`${fuel}_entsoe`] = entsoe[fuel] ?? null;
        row[`${fuel}_actual`] = act[fuel] ?? null;
      }
      return row;
    });

    function accuracyFor(source) {
      const acc = {};
      for (const fuel of FUELS) {
        const pairs = merged.filter((r) => r[`${fuel}_${source}`] != null && r[`${fuel}_actual`] != null);
        if (!pairs.length) { acc[fuel] = null; continue; }
        const errors = pairs.map((r) => Math.abs(r[`${fuel}_actual`] - r[`${fuel}_${source}`]));
        const mae = errors.reduce((s, e) => s + e, 0) / errors.length;
        const pctErrors = pairs.filter((r) => r[`${fuel}_actual`] > 50).map((r) => Math.abs(r[`${fuel}_actual`] - r[`${fuel}_${source}`]) / r[`${fuel}_actual`]);
        const mape = pctErrors.length ? (pctErrors.reduce((s, e) => s + e, 0) / pctErrors.length) * 100 : null;
        acc[fuel] = { mae_mw: mae, mape_pct: mape, n_points: pairs.length };
      }
      return acc;
    }

    return NextResponse.json({
      country: COUNTRY,
      from: from.toISOString(),
      to: to.toISOString(),
      points: merged,
      accuracy_own: accuracyFor("own"),
      accuracy_entsoe: accuracyFor("entsoe"),
      models: Object.fromEntries(FUELS.map((f, i) => [f, models[i]])),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
