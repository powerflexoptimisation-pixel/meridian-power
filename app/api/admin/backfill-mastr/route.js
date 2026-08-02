// app/api/admin/backfill-mastr/route.js
// Usage: /api/admin/backfill-mastr?secret=...
// Récupère la totalité des éoliennes allemandes en service depuis le
// Marktstammdatenregister (~32 000 unités, ~7 pages de 5000), les agrège
// en grille pondérée par capacité (résolution ~0.5° x 0.75°) et stocke le
// résultat. Cette grille remplace ensuite la pondération par capacité
// régionale (8 Länder) dans lib/weather.js pour Wind Onshore/Offshore —
// bien plus précis, basé sur la position réelle de chaque parc plutôt
// qu'une approximation au niveau du Land.
//
// À relancer périodiquement (nouveaux parcs mis en service, mix évolue) —
// pas besoin de fréquence élevée, le parc éolien allemand évolue lentement
// (quelques centaines de MW/mois au niveau national).

import { NextResponse } from "next/server";
import { fetchAllWindTurbines, aggregateToGrid } from "../../../../lib/mastr";
import { saveMastrGrid } from "../../../../lib/db";

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

  try {
    const turbines = await fetchAllWindTurbines();
    const { onshore, offshore } = aggregateToGrid(turbines);

    const onshoreStored = await saveMastrGrid("Wind Onshore", onshore);
    const offshoreStored = await saveMastrGrid("Wind Offshore", offshore);

    const totalOnshoreKw = onshore.reduce((s, p) => s + p.weight, 0);
    const totalOffshoreKw = offshore.reduce((s, p) => s + p.weight, 0);

    return NextResponse.json({
      done_at: new Date().toISOString(),
      turbines_fetched: turbines.length,
      grid: {
        onshore: { cells: onshoreStored, total_mw: Math.round(totalOnshoreKw / 1000) },
        offshore: { cells: offshoreStored, total_mw: Math.round(totalOffshoreKw / 1000) },
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
