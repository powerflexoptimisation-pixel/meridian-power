// app/api/cron/own-forecast/route.js
// Génère et persiste la prévision "maison" à partir de la météo actuelle
// (DWD ICON-D2, mise à jour toutes les 1-3h côté Open-Meteo) et du modèle
// calibré (voir /api/admin/calibrate-own-forecast). Destiné à être appelé
// fréquemment par un scheduler externe (GitHub Actions) — c'est là tout
// l'intérêt face à ENTSO-E qui ne publie qu'une fois par jour.

import { NextResponse } from "next/server";
import { fetchWeatherForecast } from "../../../../lib/weather";
import { predict } from "../../../../lib/forecast-model";
import { getForecastModel, upsertOwnForecast } from "../../../../lib/db";

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

  const results = {};
  for (const fuel of FUELS) {
    try {
      const model = await getForecastModel(COUNTRY, fuel);
      if (!model) {
        results[fuel] = { stored: 0, error: "modèle non calibré — lancer /api/admin/calibrate-own-forecast d'abord" };
        continue;
      }
      const weather = await fetchWeatherForecast(fuel, 7);
      const forecast = predict(model, weather);
      const stored = await upsertOwnForecast(COUNTRY, fuel, forecast);
      results[fuel] = { stored, model_updated_at: model.updated_at };
    } catch (err) {
      results[fuel] = { stored: 0, error: String(err.message || err) };
    }
  }

  return NextResponse.json({ ran_at: new Date().toISOString(), country: COUNTRY, results });
}
