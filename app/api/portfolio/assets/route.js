// app/api/portfolio/assets/route.js
// GET  /api/portfolio/assets?country=DE&asset_type=wind
// POST /api/portfolio/assets  { name, asset_type, country, capacity_mw, ... }

import { NextResponse } from "next/server";
import { listAssets, createAsset } from "../../../../lib/portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.toUpperCase();
  const asset_type = searchParams.get("asset_type");
  try {
    const assets = await listAssets({ country, asset_type });
    return NextResponse.json({ assets });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const asset = await createAsset(body);
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}
