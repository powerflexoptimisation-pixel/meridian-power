// app/api/portfolio/ppa/route.js
// GET  /api/portfolio/ppa?asset_id=3&country=DE&active_on=2026-08-04
// POST /api/portfolio/ppa  { counterparty, structure, start_date, end_date, country, ... }

import { NextResponse } from "next/server";
import { listPPAs, createPPA } from "../../../../lib/portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const asset_id = searchParams.get("asset_id") ? Number(searchParams.get("asset_id")) : undefined;
  const country = searchParams.get("country")?.toUpperCase();
  const active_on = searchParams.get("active_on");
  try {
    const ppas = await listPPAs({ asset_id, country, active_on });
    return NextResponse.json({ ppas });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const ppa = await createPPA(body);
    return NextResponse.json({ ppa }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}
