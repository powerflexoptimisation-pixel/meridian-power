// app/api/admin/backfill-forecast/route.js
// Usage: /api/admin/backfill-forecast?days=30&country=DE&offset=0&secret=...
// Backfill historique de la prévision éolien/solaire day-ahead (ENTSO-E
// A69) dans market_wind_solar_forecast. Le réalisé (market_generation) est
// déjà backfillé sur ~365 jours depuis une session précédente — cette
// route ne couvre que le volet prévision, day-by-day (comme
// /api/admin/backfill pour le réalisé), paginable via offset pour un
// backfill > 90 jours (365j = ~4-5 appels de days=90).

import { NextResponse } from "next/server";
import { fetchWindSolarForecast, DOMAINS } from "../../../../lib/entsoe";
import { upsertWindSolarForecast } from "../../../../lib/db";
import { berlinMidnightUTC } from "../../../../lib/tz";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || searchParams.get("secret") === secret;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(Number(searchParams.get("days") || "30"), 90);
  const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);
  const onlyCountry = searchParams.get("country");
  const countries = onlyCountry ? [onlyCountry.toUpperCase()] : Object.keys(DOMAINS);

  for (const c of countries) {
    if (!DOMAINS[c]) {
      return NextResponse.json({ error: `Marché inconnu: ${c}` }, { status: 400 });
    }
  }

  const summary = [];

  for (const country of countries) {
    let daysStored = 0;
    let daysEmpty = 0;
    let daysFailed = 0;
    let rowsTotal = 0;
    for (let i = 1; i <= days; i++) {
      const dayIndex = offset + i;
      const periodEnd = berlinMidnightUTC(dayIndex - 1);
      const periodStart = berlinMidnightUTC(dayIndex);
      try {
        const forecast = await fetchWindSolarForecast(country, periodStart, periodEnd);
        const stored = await upsertWindSolarForecast(country, forecast.points);
        rowsTotal += stored;
        if (stored > 0) daysStored++;
        else daysEmpty++;
      } catch (err) {
        daysFailed++;
      }
    }
    summary.push({ country, daysStored, daysEmpty, daysFailed, rowsTotal });
  }

  return NextResponse.json({
    done_at: new Date().toISOString(),
    range: `J-${offset + days} à J-${offset + 1}`,
    summary,
  });
}
