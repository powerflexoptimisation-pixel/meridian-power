// app/api/portfolio/assets/[id]/route.js
// GET /api/portfolio/assets/12
// PATCH /api/portfolio/assets/12  { ...champs à mettre à jour }
// DELETE /api/portfolio/assets/12

import { NextResponse } from "next/server";
import { getAsset, updateAsset, deleteAsset } from "../../../../../lib/portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request, { params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  try {
    const asset = await getAsset(id);
    if (!asset) return NextResponse.json({ error: "Asset introuvable" }, { status: 404 });
    return NextResponse.json({ asset });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  try {
    const body = await request.json();
    const asset = await updateAsset(id, body);
    if (!asset) return NextResponse.json({ error: "Asset introuvable" }, { status: 404 });
    return NextResponse.json({ asset });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  try {
    const ok = await deleteAsset(id);
    if (!ok) return NextResponse.json({ error: "Asset introuvable" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
