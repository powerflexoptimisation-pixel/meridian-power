// app/api/admin/backfill-own-forecast-history/route.js
// Usage: /api/admin/backfill-own-forecast-history?days=31&secret=...
// Reconstitue un historique de prévision "day-ahead-équivalente" sur les
// derniers N jours, via la Previous Runs API d'Open-Meteo (prévision
// météo TELLE QU'ELLE ÉTAIT ÉMISE 24h à l'avance — pas la météo réelle
// après coup, voir lib/weather.js: fetchWeatherPreviousDay1). Permet de
// calculer un MAPE maison vs ENTSO-E immédiatement, sans attendre
// l'accumulation naturelle de vintages au fil des jours.
//
// generated_at est fixé à ts - 24h pour chaque point, cohérent avec le
// filtre getOwnForecastDayAhead() (generated_at <= ts - 18h).

import { NextResponse } from "next/server";
import { fetchWeatherPreviousDay1 } from "../../../../lib/weather";
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
  const { searchParams } = new URL(request.url);
  const days = Math.min(Number(searchParams.get("days") || "31"), 31); // limite Open-Meteo Previous Runs: past_days max ~31-92 selon modèle, prudence à 31
  const onlyFuel = searchParams.get("fuel");
  const fuels = onlyFuel ? [onlyFuel] : FUELS;

  const results = {};
  for (const fuel of fuels) {
    try {
      const model = await getForecastModel(COUNTRY, fuel);
      if (!model) {
        results[fuel] = { stored: 0, error: "modèle non calibré" };
        continue;
      }
      const weather = await fetchWeatherPreviousDay1(fuel, days);
      const forecast = predict(model, weather).map((p) => ({
        timestamp: p.timestamp,
        quantity_mw: p.quantity_mw,
        // "généré" 24h avant l'échéance — cohérent avec _previous_day1.
        generatedAt: new Date(new Date(p.timestamp).getTime() - 24 * 3600 * 1000),
      }));
      // upsertOwnForecast attend un generated_at unique par appel (voir
      // lib/db.js) — ici chaque point a le SIEN (dépend de ts), donc on
      // regroupe par generated_at arrondi à l'heure pour rester compatible
      // sans réécrire la fonction: un appel par groupe horaire serait trop
      // coûteux (31j x 24h = 744 appels). On insère directement en SQL brut
      // à la place, plus adapté ici.
      const sql = (await import("../../../../lib/db")).getSql();
      let stored = 0;
      const BATCH = 200;
      for (let i = 0; i < forecast.length; i += BATCH) {
        const batch = forecast.slice(i, i + BATCH);
        const countries = batch.map(() => COUNTRY);
        const fuelsArr = batch.map(() => fuel);
        const timestamps = batch.map((p) => p.timestamp);
        const generatedAts = batch.map((p) => p.generatedAt);
        const quantities = batch.map((p) => p.quantity_mw);
        await sql`
          INSERT INTO own_wind_solar_forecast (country, ts, fuel_type, generated_at, quantity_mw)
          SELECT * FROM unnest(${countries}::varchar[], ${timestamps}::timestamptz[], ${fuelsArr}::varchar[], ${generatedAts}::timestamptz[], ${quantities}::numeric[])
          ON CONFLICT (country, ts, fuel_type, generated_at) DO NOTHING
        `;
        stored += batch.length;
      }
      results[fuel] = { stored, points: forecast.length };
    } catch (err) {
      results[fuel] = { stored: 0, error: String(err.message || err) };
    }
  }

  return NextResponse.json({ done_at: new Date().toISOString(), days, results });
}
