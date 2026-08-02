import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") || "Energietraeger~eq~2497";
  const page = searchParams.get("page") || "1";
  const pageSize = searchParams.get("pageSize") || "3";
  const url = `https://www.marktstammdatenregister.de/MaStR/Einheit/EinheitJson/GetErweiterteOeffentlicheEinheitStromerzeugung?filter=${encodeURIComponent(filter)}&page=${page}&pageSize=${pageSize}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    return NextResponse.json({ status: res.status, url, raw: text.slice(0, 3000) });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
