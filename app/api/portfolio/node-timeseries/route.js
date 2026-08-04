// app/api/portfolio/node-timeseries/route.js
// POST /api/portfolio/node-timeseries
// { nodeKeys: ["portfolio", "tso|DE|50Hertz", "tech|DE|50Hertz|wind", "asset|1"],
//   seriesTypes: ["forecast","actual","open_position"],
//   resolution: "1h",   // 15m|30m|1h|4h|1D|1W|1M|1Q|1Y
//   from: "2026-08-01T00:00:00.000Z", to: "2026-08-05T00:00:00.000Z" }
//
// Renvoie, pour chaque combinaison (node, series_type), les points agrégés
// à la résolution demandée avec l'unité correcte (MW <=1h, MWh au-delà).

import { NextResponse } from "next/server";
import { getNodeTimeseries, RESOLUTIONS } from "../../../../lib/portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await getNodeTimeseries(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}

export async function GET() {
  // Expose la liste des résolutions supportées pour construire le sélecteur côté UI.
  return NextResponse.json({ resolutions: RESOLUTIONS });
}
