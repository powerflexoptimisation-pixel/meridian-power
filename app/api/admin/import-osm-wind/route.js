// app/api/admin/import-osm-wind/route.js
// Usage: /api/admin/import-osm-wind?bbox=51.7,5.9,55.1,10.5&secret=...
// Importe les éoliennes OpenStreetMap d'une zone (bbox: "south,west,north,
// east"), agrège en grille 0,25° et stocke dans wind_turbine_grid. À
// appeler zone par zone pour couvrir l'Allemagne (le serveur Overpass
// timeout sur le pays entier en une requête — voir lib/osm-wind.js).

import { NextResponse } from "next/server";
import { fetchWindTurbinesGrid } from "../../../../lib/osm-wind";
import { upsertWindGridCells } from "../../../../lib/db";

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
  const bbox = searchParams.get("bbox");
  if (!bbox) {
    return NextResponse.json({ error: "Paramètre bbox requis (format: south,west,north,east)" }, { status: 400 });
  }
  try {
    const cells = await fetchWindTurbinesGrid(bbox);
    const stored = await upsertWindGridCells(cells, "osm");
    const totalCapacity = cells.reduce((s, c) => s + c.capacity_mw, 0);
    const totalTurbines = cells.reduce((s, c) => s + c.turbine_count, 0);
    return NextResponse.json({ bbox, cells_stored: stored, total_capacity_mw: Math.round(totalCapacity), total_turbines: totalTurbines });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
