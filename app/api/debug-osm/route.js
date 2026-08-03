import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const query = `
    [out:json][timeout:25];
    (
      node["generator:source"="wind"](53.0,7.5,53.5,8.5);
    );
    out body;
  `;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "MeridianPower/1.0 (energy market data platform; contact: power.flex.optimisation@gmail.com)", "Accept": "application/json" },
      body: "data=" + encodeURIComponent(query),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { return NextResponse.json({ status: res.status, rawTextStart: text.slice(0, 500) }); }
    const elements = json.elements || [];
    const withOutput = elements.filter((e) => e.tags?.["generator:output:electricity"]);
    return NextResponse.json({
      status: res.status,
      count: elements.length,
      with_capacity_tag: withOutput.length,
      sample: elements.slice(0, 5).map((e) => ({ lat: e.lat, lon: e.lon, tags: e.tags })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
