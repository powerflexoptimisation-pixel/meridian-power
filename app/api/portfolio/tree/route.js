// app/api/portfolio/tree/route.js
// GET /api/portfolio/tree?country=DE
// Renvoie le portefeuille agrégé sous forme d'arbre:
// Portfolio > TSO (50Hertz/Amprion/TenneT/TransnetBW pour DE, RTE/Terna/REE
// pour FR/IT/ES) > Technologie (wind/pv/bess/flexible/dsm) > Actifs.

import { NextResponse } from "next/server";
import { getPortfolioTree } from "../../../../lib/portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.toUpperCase();
  try {
    const tree = await getPortfolioTree({ country });
    return NextResponse.json(tree);
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
