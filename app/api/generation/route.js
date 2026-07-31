// app/api/generation/route.js
// Usage: /api/generation?country=DE&from=2026-06-24&to=2026-06-24
// (from/to omis -> hier, journée de marché Berlin)
// Renvoie le mix de génération 15-min pour un marché sur une période bornée
// (max 7 jours), depuis les données historiques stockées en base.

import { NextResponse } from "next/server";
import { DOMAINS } from "../../../lib/entsoe";
import { getGenerationHistory } from "../../../lib/db";
import { berlinMidnightUTC, berlinDateToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get("country") || "").toUpperCase();

  if (!DOMAINS[country]) {
    return NextResponse.json(
      { error: `Marché inconnu. Valeurs acceptées: ${Object.keys(DOMAINS).join(", ")}` },
      { status: 400 }
    );
  }

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  let from, to;
  if (fromParam && toParam) {
    from = berlinDateToUTC(fromParam);
    to = new Date(berlinDateToUTC(toParam).getTime() + 24 * 3600 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ error: "Plage from/to invalide (format attendu: YYYY-MM-DD)." }, { status: 400 });
    }
  } else {
    to = berlinMidnightUTC(0);
    from = berlinMidnightUTC(1);
  }

  if (to.getTime() - from.getTime() > 8 * 24 * 3600 * 1000) {
    return NextResponse.json({ error: "Plage limitée à 7 jours (résolution 15-min)." }, { status: 400 });
  }

  try {
    const generation = await getGenerationHistory(country, from.toISOString(), to.toISOString());
    return NextResponse.json({ country, from: from.toISOString(), to: to.toISOString(), generation });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
