import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const url = "https://api.open-meteo.com/v1/dwd-icon?latitude=48.9&longitude=11.4&hourly=shortwave_radiation,shortwave_radiation_instant&forecast_days=1&timezone=UTC";
  const res = await fetch(url);
  const json = await res.json();
  const h = json.hourly || {};
  const rows = h.time.map((t,i) => ({ t, avg: h.shortwave_radiation[i], instant: h.shortwave_radiation_instant?.[i] }));
  return NextResponse.json({ status: res.status, rows: rows.slice(4, 10) });
}
