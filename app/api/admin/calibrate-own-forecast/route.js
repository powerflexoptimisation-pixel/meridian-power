// app/api/admin/calibrate-own-forecast/route.js
// Usage: /api/admin/calibrate-own-forecast?days=120&secret=...
// Calibre le modèle de prévision maison (Wind Onshore/Offshore/Solar) en
// régressant la météo historique (Open-Meteo archive) contre le réalisé
// déjà stocké (market_generation). À relancer périodiquement (le mix de
// capacité installée évolue avec le temps — un modèle calibré une fois
// devient obsolète).

import { NextResponse } from "next/server";
import { fetchWeatherHistorical } from "../../../../lib/weather";
import { calibrate } from "../../../../lib/forecast-model";
import { getGenerationHistory, saveForecastModel } from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || searchParams.get("secret") === secret;
}

const FUELS = ["Wind Onshore", "Wind Offshore", "Solar"];
const COUNTRY = "DE";

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(Number(searchParams.get("days") || "120"), 200);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  const startDate = from.toISOString().slice(0, 10);
  const endDate = to.toISOString().slice(0, 10);

  const actual = await getGenerationHistory(COUNTRY, from, to);
  const actualByTs = {};
  for (const fuel of FUELS) {
    actualByTs[fuel] = new Map(actual.filter((p) => p[fuel] != null).map((p) => [p.timestamp, p[fuel]]));
  }

  const results = {};
  for (const fuel of FUELS) {
    try {
      const weather = await fetchWeatherHistorical(fuel, startDate, endDate);
      const model = calibrate(weather, actualByTs[fuel], fuel);
      if (model) {
        await saveForecastModel(COUNTRY, fuel, model);
        results[fuel] = { calibrated: true, n_points: model.n_points, a: model.a, b: model.b };
      } else {
        results[fuel] = { calibrated: false, reason: "pas assez de points appariés météo/réalisé" };
      }
    } catch (err) {
      results[fuel] = { calibrated: false, error: String(err.message || err) };
    }
  }

  return NextResponse.json({ done_at: new Date().toISOString(), range: `${startDate} -> ${endDate}`, results });
}
