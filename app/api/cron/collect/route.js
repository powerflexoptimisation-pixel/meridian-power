// app/api/cron/collect/route.js
import { NextResponse } from "next/server";
import { collectCountry, DOMAINS } from "../../../../lib/entsoe";
import { upsertPrices, upsertGeneration, upsertLoad, logCollection } from "../../../../lib/db";

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
