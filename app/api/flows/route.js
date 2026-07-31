// app/api/flows/route.js
// Usage: /api/flows?country=DE&from=2026-06-24&to=2026-06-24
// (from/to omis -> hier ; max 7 jours, résolution native ENTSO-E ~15-60 min)
//
// Renvoie le flux net physique (MW) entre `country` et chacun de ses voisins
// pertinents (voir RELEVANT_NEIGHBORS dans lib/entsoe.js). Positif = export
// net depuis `country`, négatif = import net.
// Données récupérées à la volée depuis ENTSO-E (pas stockées en base).

import { NextResponse } from "next/server";
import { DOMAINS, RELEVANT_NEIGHBORS, fetchNetFlow } from "../../../lib/entsoe";
import { berlinMidnightUTC, berlinDateToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
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

  const neighbors = RELEVANT_NEIGHBORS[country] || [];
  if (neighbors.length === 0) {
    return NextResponse.json({ country, neighbors: [], flows: {} });
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
    return NextResponse.json({ error: "Plage limitée à 7 jours." }, { status: 400 });
  }

  try {
    const flows = {};
    await Promise.all(
      neighbors.map(async (n) => {
        const points = await fetchNetFlow(country, n, from, to);
        flows[n] = points;
      })
    );

    return NextResponse.json({ country, neighbors, from: from.toISOString(), to: to.toISOString(), flows });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
