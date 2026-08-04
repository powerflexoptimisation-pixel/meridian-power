// app/api/portfolio/ppa/[id]/route.js
// PATCH /api/portfolio/ppa/5  { ...champs à mettre à jour }
// DELETE /api/portfolio/ppa/5

import { NextResponse } from "next/server";
import { updatePPA, deletePPA } from "../../../../../lib/portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function PATCH(request, { params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  try {
    const body = await request.json();
    const ppa = await updatePPA(id, body);
    if (!ppa) return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 });
    return NextResponse.json({ ppa });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  try {
    const ok = await deletePPA(id);
    if (!ok) return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
