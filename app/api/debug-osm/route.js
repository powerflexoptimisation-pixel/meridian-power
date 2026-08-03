import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  // Petite zone de test (Basse-Saxe côtière, forte densité éolienne) avant
  // de lancer une requête pays entier (potentiellement lourde/coûteuse).
  const query = `
    [out:json][timeout:25];
    (
      node["generator:source"="wind"](53.0,7.5,53.5,8.5);
    );
    out body;
  `;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });
  const json = await res.json();
  const elements = json.elements || [];
  const withOutput = elements.filter((e) => e.tags?.["generator:output:electricity"]);
  return NextResponse.json({
    status: res.status,
    count: elements.length,
    with_capacity_tag: withOutput.length,
    sample: elements.slice(0, 5).map((e) => ({ lat: e.lat, lon: e.lon, tags: e.tags })),
  });
}
