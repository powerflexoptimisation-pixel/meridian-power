// app/api/cron/collect-entsoe-realtime/route.js
// Comble un vrai trou architectural: le cron quotidien (/api/cron/collect)
// ne récupère QUE "hier" (jour complet), une fois par jour — les données
// d'AUJOURD'HUI n'atteignaient donc jamais la base avant le lendemain,
// même si ENTSO-E les publie avec ~15-30 min de retard seulement (vérifié
// en direct: /api/entsoe en mode live a des points à quelques dizaines de
// minutes de "maintenant"). Cette route réutilise collectLatest() (déjà
// utilisée pour l'affichage live, jamais persistée jusqu'ici) et écrit en
// base — à appeler fréquemment (GitHub Actions, voir
// .github/workflows/collect-entsoe-realtime.yml) pour que les tables
// market_prices/market_generation/market_load restent à jour tout au long
// de la journée, pas seulement une fois par jour.

import { NextResponse } from "next/server";
import { collectCountryForRange, DOMAINS } from "../../../../lib/entsoe";
import { berlinMidnightUTC } from "../../../../lib/tz";
import { upsertPrices, upsertGeneration, upsertLoad } from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || searchParams.get("secret") === secret;
}

// Fenêtre volontairement plus légère que collectLatest() (aujourd'hui +
// demain, pas hier->demain): "hier" est déjà couvert par le cron quotidien,
// inutile de le re-scanner à chaque appel toutes les 20 min. Réduit le
// volume de données pour rester sous la limite de 60s sur les 4 marchés.
async function collectOne(country) {
  const periodStart = berlinMidnightUTC(0);
  const periodEnd = berlinMidnightUTC(-1);
  const data = await collectCountryForRange(country, periodStart, periodEnd);
  const nPrices = await upsertPrices(country, data.prices);
  const nGen = await upsertGeneration(country, data.generation);
  const nLoad = await upsertLoad(country, data.load);
  return { prices_stored: nPrices, generation_rows_stored: nGen, load_rows_stored: nLoad, warnings: data.warnings };
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const countries = Object.keys(DOMAINS);
  const settled = await Promise.allSettled(countries.map(collectOne));
  const results = {};
  settled.forEach((res, i) => {
    const country = countries[i];
    results[country] = res.status === "fulfilled" ? res.value : { error: String(res.reason?.message || res.reason) };
  });
  return NextResponse.json({ ran_at: new Date().toISOString(), results });
}
