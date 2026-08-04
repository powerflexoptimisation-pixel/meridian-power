// app/api/portfolio/timeseries/route.js
// POST /api/portfolio/timeseries  { points: [{ asset_id, ts, series_type, value_mw }, ...] }
//   series_type ∈ forecast | actual | traded_da | traded_id | nominated_ppa
// GET  /api/portfolio/timeseries?asset_id=1&from=2026-08-01&to=2026-08-02
//   -> points pivotés par ts avec open_position calculée

import { NextResponse } from "next/server";
import { upsertTimeseries, getAssetTimeseries } from "../../../../lib/portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await upsertTimeseries(body.points);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const asset_id = Number(searchParams.get("asset_id"));
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!Number.isInteger(asset_id) || !from || !to) {
    return NextResponse.json({ error: "asset_id, from, to sont requis" }, { status: 400 });
  }
  try {
    const points = await getAssetTimeseries(asset_id, from, to);
    return NextResponse.json({ asset_id, from, to, points });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
