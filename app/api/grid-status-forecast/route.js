// app/api/grid-status-forecast/route.js
// Usage: /api/grid-status-forecast?country=DE&from=2026-07-25&to=2026-07-31
// PROXY MAISON — pas une donnée officielle. Charge résiduelle prévue =
// Load forecast − (Solar + Wind Onshore + Wind Offshore) forecast, day-ahead
// (ENTSO-E A65 + A69). Une charge résiduelle prévue élevée est un indicateur
// indirect de tension système probable (plus de moyens pilotables
// nécessaires), mais ce n'est PAS une prévision officielle de tension
// réseau — netztransparenz.de ne publie que le Traffic Light en temps réel
// (constaté), aucune source ne prévoit ce signal à l'avance à notre
// connaissance.

import { NextResponse } from "next/server";
import { getWindSolarForecastHistory, getLoadForecastHistory } from "../../../lib/db";
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
    // Par défaut: la prévision porte principalement sur demain (publiée
    // hier/aujourd'hui) — fenêtre resserrée autour d'aujourd'hui/demain.
    from = new Date(Date.now() - 24 * 3600 * 1000);
    to = new Date(Date.now() + 48 * 3600 * 1000);
  }

  try {
    const [windSolar, load] = await Promise.all([
      getWindSolarForecastHistory(country, from, to),
      getLoadForecastHistory(country, from, to),
    ]);

    const renewByTs = new Map(
      windSolar.map((p) => [p.timestamp, (p["Solar"] || 0) + (p["Wind Onshore"] || 0) + (p["Wind Offshore"] || 0)])
    );
    const loadByTs = new Map(load.map((p) => [p.timestamp, p.load_mw]));
    const allTs = [...new Set([...renewByTs.keys(), ...loadByTs.keys()])].sort();

    const points = allTs
      .filter((ts) => loadByTs.has(ts)) // la charge résiduelle n'a de sens que si on a au moins la prévision de conso
      .map((ts) => {
        const loadMw = loadByTs.get(ts);
        const renewMw = renewByTs.get(ts) || 0;
        return { timestamp: ts, load_forecast_mw: loadMw, renewable_forecast_mw: renewMw, residual_load_forecast_mw: loadMw - renewMw };
      });

    // Bandes de référence: percentiles de la charge résiduelle prévue sur la
    // période affichée elle-même (pas de seuil "officiel" disponible).
    const values = points.map((p) => p.residual_load_forecast_mw).sort((a, b) => a - b);
    const percentile = (p) => (values.length ? values[Math.floor((values.length - 1) * p)] : null);
    const bands = values.length ? { p25: percentile(0.25), p50: percentile(0.5), p75: percentile(0.75), p90: percentile(0.9) } : null;

    return NextResponse.json({ country, from: from.toISOString(), to: to.toISOString(), points, bands });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
