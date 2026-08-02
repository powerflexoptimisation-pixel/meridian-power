import { NextResponse } from "next/server";
import { fetchWindSolarForecast } from "../../../lib/entsoe";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || "2025-08-15";
  const from = new Date(date + "T00:00:00Z");
  const to = new Date(date + "T23:59:00Z");
  try {
    const result = await fetchWindSolarForecast("DE", from, to);
    return NextResponse.json({ count: result.points.length, warning: result.warning, sample: result.points.slice(0, 3) });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
