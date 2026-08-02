import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pageSize = searchParams.get("pageSize") || "5000";
  const page = searchParams.get("page") || "1";
  const filter = "Energieträger~eq~2497~and~Betriebs-Status~eq~35";
  const url = `https://www.marktstammdatenregister.de/MaStR/Einheit/EinheitJson/GetErweiterteOeffentlicheEinheitStromerzeugung?filter=${encodeURIComponent(filter)}&page=${page}&pageSize=${pageSize}`;
  const start = Date.now();
  const res = await fetch(url);
  const json = await res.json();
  const elapsed = Date.now() - start;
  return NextResponse.json({ elapsed_ms: elapsed, dataCount: json.Data?.length, total: json.Total });
}
