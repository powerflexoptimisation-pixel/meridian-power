import { NextResponse } from "next/server";
import { fetchNetTransferCapacityForecast } from "../../../lib/entsoe";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "DE";
  const to = searchParams.get("to") || "AT";
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 24 * 3600 * 1000);
  try {
    const result = await fetchNetTransferCapacityForecast(from, to, periodStart, periodEnd);
    return NextResponse.json({ count: result.points.length, warning: result.warning, sample: result.points.slice(0, 5) });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
