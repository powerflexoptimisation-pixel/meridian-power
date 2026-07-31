// app/api/analysis/route.js
// Usage: /api/analysis?country=DE&from=2026-06-24&to=2026-06-24
// (from/to omis -> hier, journée de marché Berlin ; max 7 jours, résolution 15-min)
//
// Renvoie, pour chaque point 15-min:
//   - consumption   : charge réelle (Actual Total Load)
//   - windPv        : Solar + Wind Onshore + Wind Offshore
//   - otherRenew    : Hydro* + Biomass + Geothermal + Other renewable + Marine
//   - residualLoad  : consumption - windPv (définition standard "residual load")

import { NextResponse } from "next/server";
import { DOMAINS } from "../../../lib/entsoe";
import { getLoadHistory, getGenerationHistory } from "../../../lib/db";
import { berlinMidnightUTC, berlinDateToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const WIND_PV = ["Solar", "Wind Onshore", "Wind Offshore"];
const OTHER_RENEWABLES = [
  "Hydro Run-of-river", "Hydro Water Reservoir", "Hydro Pumped Storage",
  "Biomass", "Geothermal", "Other renewable", "Marine",
];

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
    const [loadPoints, genPoints] = await Promise.all([
      getLoadHistory(country, from.toISOString(), to.toISOString()),
      getGenerationHistory(country, from.toISOString(), to.toISOString()),
    ]);

    const genByTs = new Map(genPoints.map((row) => [row.timestamp, row]));
    const series = loadPoints.map((lp) => {
      const gen = genByTs.get(lp.timestamp) || {};
      const windPv = WIND_PV.reduce((s, k) => s + (gen[k] || 0), 0);
      const otherRenew = OTHER_RENEWABLES.reduce((s, k) => s + (gen[k] || 0), 0);
      return {
        timestamp: lp.timestamp,
        consumption: lp.load_mw,
        windPv,
        otherRenew,
        residualLoad: lp.load_mw - windPv,
      };
    });

    return NextResponse.json({ country, from: from.toISOString(), to: to.toISOString(), series });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
