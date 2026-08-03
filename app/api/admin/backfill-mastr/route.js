// app/api/admin/backfill-mastr/route.js
// Usage: /api/admin/backfill-mastr?page=1&reset=true&secret=...
//        /api/admin/backfill-mastr?page=2&secret=...
//        ... jusqu'à page=7 (total ~32 000 éoliennes / 5000 par page)
// Récupère UNE page d'éoliennes depuis le Marktstammdatenregister, les
// agrège en grille (résolution ~0.5° x 0.75°) et ACCUMULE dans la grille
// existante. Paginé sur plusieurs appels HTTP séparés: chaque page prend
// ~20s côté MaStR, le total (~140s pour 7 pages) dépasse largement les 60s
// d'une invocation Vercel — voir lib/mastr.js.
//
// reset=true (à mettre sur le tout premier appel, page=1) vide la grille
// avant d'accumuler — sans ça, un ré-import s'additionnerait à l'ancien
// au lieu de le remplacer.
//
// À relancer périodiquement (nouveaux parcs mis en service) — pas besoin
// de fréquence élevée, le parc éolien allemand évolue lentement.

import { NextResponse } from "next/server";
import { fetchWindTurbinesPage, aggregateToGrid } from "../../../../lib/mastr";
import { resetMastrGrid, accumulateMastrGrid } from "../../../../lib/db";

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
  const page = Math.max(Number(searchParams.get("page") || "1"), 1);
  const pageSize = Number(searchParams.get("pageSize") || "5000");
  const reset = searchParams.get("reset") === "true";

  try {
    if (reset) {
      await resetMastrGrid("Wind Onshore");
      await resetMastrGrid("Wind Offshore");
    }

    const { turbines, total } = await fetchWindTurbinesPage(page, pageSize);
    const { onshore, offshore } = aggregateToGrid(turbines);

    const onshoreStored = await accumulateMastrGrid("Wind Onshore", onshore);
    const offshoreStored = await accumulateMastrGrid("Wind Offshore", offshore);

    const pagesTotal = Math.ceil(total / pageSize);
    return NextResponse.json({
      done_at: new Date().toISOString(),
      page,
      pages_total: pagesTotal,
      turbines_this_page: turbines.length,
      total_turbines: total,
      cells_updated: { onshore: onshoreStored, offshore: offshoreStored },
      next_page: page < pagesTotal ? page + 1 : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
