import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "sample";
  try {
    if (mode === "filters") {
      const res = await fetch("https://www.marktstammdatenregister.de/MaStR/Einheit/EinheitJson/GetFilterColumnsErweiterteOeffentlicheEinheitStromerzeugung");
      const json = await res.json();
      return NextResponse.json({ status: res.status, json });
    }
    const url = "https://www.marktstammdatenregister.de/MaStR/Einheit/EinheitJson/GetErweiterteOeffentlicheEinheitStromerzeugung?page=1&pageSize=3";
    const res = await fetch(url);
    const text = await res.text();
    return NextResponse.json({ status: res.status, raw: text.slice(0, 3000) });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
