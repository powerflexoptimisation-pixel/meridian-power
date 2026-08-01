// app/api/cron/collect/route.js
import { NextResponse } from "next/server";
import { collectCountry, DOMAINS } from "../../../../lib/entsoe";
import { collectDe } from "../../../../lib/netztransparenz";
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

const DE_UPSERTERS = {
  redispatch: upsertRedispatch,
  rebap: upsertReBAP,
  aep_schaetzer: upsertAepSchaetzer,
  rz_saldo: upsertRZSaldo,
  activated_afrr: upsertActivatedAFRR,
  activated_mfrr: upsertActivatedMFRR,
};

// Collecte les 6 séries netztransparenz.de pour les dernières 24h glissantes
// (la plupart sont publiées toutes les 15 min ou en continu).
async function collectDeAndStore() {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 3600 * 1000);
  const results = await collectDe(from, to);
  const summary = {};
  for (const [series, { data, blocked, error }] of Object.entries(results)) {
    const stored = error ? 0 : await DE_UPSERTERS[series](data);
    const warning = error || (blocked ? "endpoint hors scope OAuth (rôle NrvSaldo requis)" : null);
    await logDeCollection(series, stored, blocked, warning);
    summary[series] = { stored, blocked, error };
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
