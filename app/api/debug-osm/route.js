import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get("bbox") || "53.0,7.5,53.5,8.5";
  const mirror = searchParams.get("mirror") || "https://overpass-api.de/api/interpreter";
  const query = `[out:json][timeout:25];(node["generator:source"="wind"](${bbox}););out body;`;
  const start = Date.now();
  try {
    const res = await fetch(mirror, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "MeridianPower/1.0 (energy market data platform; contact: power.flex.optimisation@gmail.com)", "Accept": "application/json" },
      body: "data=" + encodeURIComponent(query),
    });
    const text = await res.text();
    const ms = Date.now() - start;
    let json;
    try { json = JSON.parse(text); } catch { return NextResponse.json({ status: res.status, ms, mirror, rawTextStart: text.slice(0, 300) }); }
    const elements = json.elements || [];
    return NextResponse.json({ status: res.status, ms, mirror, count: elements.length });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err), ms: Date.now() - start, mirror }, { status: 502 });
  }
}
