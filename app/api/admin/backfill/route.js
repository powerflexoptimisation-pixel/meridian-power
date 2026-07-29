// app/api/admin/backfill/route.js
// Usage: /api/admin/backfill?days=30&country=DE  (country omis = les 4 marchés)
// Remplit rétroactivement l'historique jour par jour. À utiliser une fois au
// démarrage pour peupler la base, puis le cron prend le relais quotidiennement.
// Protégé par CRON_SECRET (même secret que le cron, ou définis-en un dédié).
//
// ATTENTION: boucle séquentielle volontaire (pas de Promise.all sur les jours)
// pour rester sous la limite de rate ENTSO-E (~400 req/min/token) et éviter
// de saturer la fonction serverless. Pour un gros backfill (>60 jours), lance
// plusieurs appels avec des plages différentes plutôt qu'un seul très long.

import { NextResponse } from "next/server";
import { collectCountryForRange, DOMAINS } from "../../../../lib/entsoe";
import { upsertPrices, upsertGeneration, logCollection } from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max (plan Pro Vercel requis au-delà de 60s ; voir note README)

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
  const days = Math.min(Number(searchParams.get("days") || "7"), 90);
  const onlyCountry = searchParams.get("country");
  const countries = onlyCountry ? [onlyCountry.toUpperCase()] : Object.keys(DOMAINS);

  for (const c of countries) {
    if (!DOMAINS[c]) {
      return NextResponse.json({ error: `Marché inconnu: ${c}` }, { status: 400 });
    }
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const summary = [];

  for (const country of countries) {
    let daysStored = 0;
    let daysFailed = 0;
    for (let i = 1; i <= days; i++) {
      const periodEnd = new Date(today.getTime() - (i - 1) * 24 * 3600 * 1000);
      const periodStart = new Date(periodEnd.getTime() - 24 * 3600 * 1000);
      try {
        const data = await collectCountryForRange(country, periodStart, periodEnd);
        const nPrices = await upsertPrices(country, data.prices);
        const nGen = await upsertGeneration(country, data.generation);
        await logCollection(country, nPrices, nGen, data.warnings);
        if (nPrices > 0) daysStored++;
        else daysFailed++;
      } catch (err) {
        daysFailed++;
      }
    }
    summary.push({ country, days_requested: days, days_stored: daysStored, days_failed: daysFailed });
  }

  return NextResponse.json({ done_at: new Date().toISOString(), summary });
}
