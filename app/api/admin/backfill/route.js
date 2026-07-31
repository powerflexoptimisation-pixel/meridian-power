// app/api/admin/backfill/route.js
// Usage: /api/admin/backfill?days=30&country=DE&offset=0
// offset = nombre de jours à sauter depuis hier (pour paginer un backfill > 90 jours).
// Ex: days=30&offset=60 -> couvre les jours 61 à 90 avant aujourd'hui.

import { NextResponse } from "next/server";
import { collectCountryForRange, DOMAINS } from "../../../../lib/entsoe";
import { upsertPrices, upsertGeneration, logCollection } from "../../../../lib/db";
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
  const days = Math.min(Number(searchParams.get("days") || "7"), 90);
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
    let daysFailed = 0;
    for (let i = 1; i <= days; i++) {
      const dayIndex = offset + i;
      // Journée de marché en heure de Berlin (CET/CEST), pas en UTC.
      const periodEnd = berlinMidnightUTC(dayIndex - 1);
      const periodStart = berlinMidnightUTC(dayIndex);
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
    summary.push({ country, offset, days_requested: days, days_stored: daysStored, days_failed: daysFailed });
  }

  return NextResponse.json({ done_at: new Date().toISOString(), summary });
}
