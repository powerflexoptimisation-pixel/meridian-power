import { NextResponse } from "next/server";
import { fetchWindSolarForecast } from "../../../lib/entsoe";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || "DE";
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 3600 * 1000);
  try {
    const result = await fetchWindSolarForecast(country, from, to);
    return NextResponse.json({ count: result.points.length, warning: result.warning, sample: result.points.slice(0, 3) });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
