// app/api/cross-border-forecast/route.js
// Usage: /api/cross-border-forecast?country=DE
// Capacité d'échange prévisionnelle (NTC, ENTSO-E A61) par frontière. Pas
// disponible pour toutes les frontières: les zones sous couplage de marché
// "flow-based" (la plupart des frontières internes UE depuis Core CCR) ne
// publient plus de NTC classique — seules quelques frontières (ex: DE-CH,
// DE-NL, FR-GB, IT-CH/AT/FR, ES-PT/FR) le font encore. Renvoie les
// frontières avec données ET la liste de celles sans donnée pour être
// honnête sur la couverture. Données récupérées à la volée (pas stockées).

import { NextResponse } from "next/server";
import { DOMAINS, RELEVANT_NEIGHBORS, fetchNetTransferCapacityForecast } from "../../../lib/entsoe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get("country") || "").toUpperCase();

  if (!DOMAINS[country]) {
    return NextResponse.json({ error: `Marché inconnu. Valeurs acceptées: ${Object.keys(DOMAINS).join(", ")}` }, { status: 400 });
  }

  const neighbors = RELEVANT_NEIGHBORS[country] || [];
  const from = new Date();
  const to = new Date(from.getTime() + 48 * 3600 * 1000);

  const ntc = {};
  const unavailable = [];
  await Promise.all(
    neighbors.map(async (n) => {
      try {
        const [out, incoming] = await Promise.all([
          fetchNetTransferCapacityForecast(country, n, from, to),
          fetchNetTransferCapacityForecast(n, country, from, to),
        ]);
        if (out.points.length === 0 && incoming.points.length === 0) {
          unavailable.push(n);
        } else {
          ntc[n] = { export: out.points, import: incoming.points };
        }
      } catch {
        unavailable.push(n);
      }
    })
  );

  return NextResponse.json({ country, from: from.toISOString(), to: to.toISOString(), ntc, unavailable });
}
