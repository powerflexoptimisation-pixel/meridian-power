// app/api/cron/collect/route.js
// Appelée automatiquement par Vercel Cron (voir vercel.json).
// Peut aussi être appelée manuellement pour forcer une collecte immédiate.

import { NextResponse } from "next/server";
import { collectCountry, DOMAINS } from "../../../../lib/entsoe";
import { upsertPrices, upsertGeneration, logCollection } from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  // Vercel Cron ajoute automatiquement ce header quand CRON_SECRET est défini
  // dans les variables d'environnement du projet. En dev/local, on laisse passer.
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {};
  for (const country of Object.keys(DOMAINS)) {
    try {
      const data = await collectCountry(country);
      const nPrices = await upsertPrices(country, data.prices);
      const nGen = await upsertGeneration(country, data.generation);
      await logCollection(country, nPrices, nGen, data.warnings);
      results[country] = { prices_stored: nPrices, generation_rows_stored: nGen, warnings: data.warnings };
    } catch (err) {
      results[country] = { error: String(err.message || err) };
    }
  }

  return NextResponse.json({ ran_at: new Date().toISOString(), results });
}
