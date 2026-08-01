// app/api/cron/collect/route.js
import { NextResponse } from "next/server";
import { collectCountry, DOMAINS } from "../../../../lib/entsoe";
import {
  fetchRedispatch, fetchReBAP, fetchRZSaldo, fetchAepSchaetzer,
  fetchActivatedAFRR, fetchActivatedMFRR,
} from "../../../../lib/netztransparenz";
import {
  upsertPrices, upsertGeneration, upsertLoad, logCollection,
  upsertRedispatch, upsertReBAP, upsertAepSchaetzer, upsertRZSaldo,
  upsertActivatedAFRR, upsertActivatedMFRR, logDeCollection,
} from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function collectOne(country) {
  const data = await collectCountry(country);
  const nPrices = await upsertPrices(country, data.prices);
  const nGen = await upsertGeneration(country, data.generation);
  const nLoad = await upsertLoad(country, data.load);
  await logCollection(country, nPrices, nGen, data.warnings);
  return { prices_stored: nPrices, generation_rows_stored: nGen, load_rows_stored: nLoad, warnings: data.warnings };
}

const DE_FETCHERS = {
  redispatch: fetchRedispatch,
  rebap: fetchReBAP,
  aep_schaetzer: fetchAepSchaetzer,
  rz_saldo: fetchRZSaldo,
  activated_afrr: fetchActivatedAFRR,
  activated_mfrr: fetchActivatedMFRR,
};

const DE_UPSERTERS = {
  redispatch: upsertRedispatch,
  rebap: upsertReBAP,
  aep_schaetzer: upsertAepSchaetzer,
  rz_saldo: upsertRZSaldo,
  activated_afrr: upsertActivatedAFRR,
  activated_mfrr: upsertActivatedMFRR,
};

// redispatch/aep_schaetzer/rz_saldo sont publiés en continu ("betrieblich")
// -> fenêtre 24h glissante suffit. reBAP/aFRR/mFRR sont "qualitätsgesichert"
// et publiés avec retard (voir doc netztransparenz.de) : si on ne regardait
// que les dernières 24h, on ne verrait JAMAIS les nouvelles données au
// moment où elles sont enfin publiées. Délais observés empiriquement (pas
// documentés précisément par netztransparenz.de): reBAP ~10-14 jours,
// aFRR/mFRR significativement plus long (~5-6 semaines) — d'où deux
// fenêtres différentes ci-dessous.
const DELAYED_WINDOWS = {
  rebap: { fromDays: 21, toDays: 3 },
  activated_afrr: { fromDays: 60, toDays: 30 },
  activated_mfrr: { fromDays: 60, toDays: 30 },
};

// Collecte les 6 séries netztransparenz.de, chacune avec la fenêtre adaptée
// à son cycle de publication (voir commentaire ci-dessus). Un seul appel
// réseau par série (pas d'orchestrateur générique qui refetch tout à chaque
// itération).
async function collectDeAndStore() {
  const now = new Date();
  const realtimeFrom = new Date(now.getTime() - 24 * 3600 * 1000);

  const summary = {};
  for (const series of Object.keys(DE_FETCHERS)) {
    const delayed = DELAYED_WINDOWS[series];
    const from = delayed ? new Date(now.getTime() - delayed.fromDays * 24 * 3600 * 1000) : realtimeFrom;
    const to = delayed ? new Date(now.getTime() - delayed.toDays * 24 * 3600 * 1000) : now;
    try {
      const data = await DE_FETCHERS[series](from, to);
      const stored = await DE_UPSERTERS[series](data);
      await logDeCollection(series, stored, null);
      summary[series] = { stored, error: null };
    } catch (err) {
      const errMsg = String(err.message || err);
      await logDeCollection(series, 0, errMsg);
      summary[series] = { stored: 0, error: errMsg };
    }
  }
  return summary;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const countries = Object.keys(DOMAINS);
  const [entsoeSettled, deSettled] = await Promise.all([
    Promise.allSettled(countries.map(collectOne)),
    Promise.allSettled([collectDeAndStore()]),
  ]);

  const results = {};
  entsoeSettled.forEach((res, i) => {
    const country = countries[i];
    results[country] = res.status === "fulfilled" ? res.value : { error: String(res.reason?.message || res.reason) };
  });

  const de = deSettled[0].status === "fulfilled" ? deSettled[0].value : { error: String(deSettled[0].reason?.message || deSettled[0].reason) };

  return NextResponse.json({ ran_at: new Date().toISOString(), results, de });
}
