import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  // Allemagne entière via le polygone administratif OSM (area) plutôt
  // qu'une bbox rectangulaire (qui inclurait des pays voisins).
  const query = `
    [out:json][timeout:50];
    area["ISO3166-1"="DE"][admin_level=2]->.de;
    (
      node["generator:source"="wind"](area.de);
    );
    out body;
  `;
  const start = Date.now();
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "MeridianPower/1.0 (energy market data platform; contact: power.flex.optimisation@gmail.com)", "Accept": "application/json" },
      body: "data=" + encodeURIComponent(query),
    });
    const text = await res.text();
    const ms = Date.now() - start;
    let json;
    try { json = JSON.parse(text); } catch { return NextResponse.json({ status: res.status, ms, rawTextStart: text.slice(0, 500) }); }
    const elements = json.elements || [];
    const withOutput = elements.filter((e) => e.tags?.["generator:output:electricity"]);
    return NextResponse.json({ status: res.status, ms, count: elements.length, with_capacity_tag: withOutput.length });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err), ms: Date.now() - start }, { status: 502 });
  }
}
