// app/api/cron/collect/route.js
// Cron quotidien Vercel (vercel.json: 13h UTC — plafond Hobby: 1x/jour).
// Couvre ENTSO-E (4 marchés) + les 6 séries netztransparenz.de. Pour une
// fraîcheur 15-min sur les séries DE temps réel, voir
// /api/cron/collect-de-realtime (appelé par un scheduler externe, GitHub
// Actions — voir .github/workflows/collect-de-realtime.yml).
import { NextResponse } from "next/server";
import { collectCountry, DOMAINS, fetchWindSolarForecast } from "../../../../lib/entsoe";
import { berlinMidnightUTC } from "../../../../lib/tz";
import { collectDeSeries, REALTIME_DE_SERIES, DELAYED_DE_SERIES, DAILY_ONLY_DE_SERIES } from "../../../../lib/collect-de";
import { upsertPrices, upsertGeneration, upsertLoad, upsertWindSolarForecast, logCollection } from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || searchParams.get("secret") === secret;
}

async function collectOne(country) {
  const data = await collectCountry(country);
  const nPrices = await upsertPrices(country, data.prices);
  const nGen = await upsertGeneration(country, data.generation);
  const nLoad = await upsertLoad(country, data.load);
  await logCollection(country, nPrices, nGen, data.warnings);

  // Prévision éolien/solaire day-ahead: fenêtre hier->demain (contrairement
  // aux données réalisées ci-dessus qui ne portent que sur "hier"), pour
  // capturer aussi bien la prévision fraîchement publiée aujourd'hui pour
  // demain que celle d'hier pour aujourd'hui, désormais comparable au réalisé.
  let nForecast = 0;
  try {
    const forecastFrom = berlinMidnightUTC(1);
    const forecastTo = berlinMidnightUTC(-1);
    const forecast = await fetchWindSolarForecast(country, forecastFrom, forecastTo);
    nForecast = await upsertWindSolarForecast(country, forecast.points);
  } catch (err) {
    // Non-bloquant: une prévision manquante ne doit pas faire échouer la
    // collecte des données réalisées.
  }

  return { prices_stored: nPrices, generation_rows_stored: nGen, load_rows_stored: nLoad, forecast_rows_stored: nForecast, warnings: data.warnings };
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const countries = Object.keys(DOMAINS);
  const [entsoeSettled, deSettled] = await Promise.all([
    Promise.allSettled(countries.map(collectOne)),
    Promise.allSettled([collectDeSeries([...REALTIME_DE_SERIES, ...DELAYED_DE_SERIES, ...DAILY_ONLY_DE_SERIES])]),
  ]);

  const results = {};
  entsoeSettled.forEach((res, i) => {
    const country = countries[i];
    results[country] = res.status === "fulfilled" ? res.value : { error: String(res.reason?.message || res.reason) };
  });

  const de = deSettled[0].status === "fulfilled" ? deSettled[0].value : { error: String(deSettled[0].reason?.message || deSettled[0].reason) };

  return NextResponse.json({ ran_at: new Date().toISOString(), results, de });
}
