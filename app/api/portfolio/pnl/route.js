// app/api/portfolio/pnl/route.js
// GET /api/portfolio/pnl?asset_id=3&from=2026-07-01&to=2026-08-01
// Calcule le P&L d'un asset: revenu marché (position x prix day-ahead) vs
// revenu PPA équivalent selon la structure du contrat actif sur la période.

import { NextResponse } from "next/server";
import { computeAssetPnl } from "../../../../lib/portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const asset_id = Number(searchParams.get("asset_id"));
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!Number.isInteger(asset_id)) {
    return NextResponse.json({ error: "asset_id requis (entier)" }, { status: 400 });
  }
  if (!from || !to) {
    return NextResponse.json({ error: "from et to requis (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const pnl = await computeAssetPnl(asset_id, from, to);
    return NextResponse.json(pnl);
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
