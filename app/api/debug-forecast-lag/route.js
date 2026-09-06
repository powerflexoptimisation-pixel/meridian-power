import { NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = getSql();
  const rows = await sql`
    SELECT ts, generated_at, fuel_type, quantity_mw,
      EXTRACT(EPOCH FROM (ts - generated_at))/3600 AS lead_time_hours
    FROM own_wind_solar_forecast
    WHERE fuel_type = 'Solar' AND ts >= now() - interval '14 days' AND ts < now()
    ORDER BY ts DESC
    LIMIT 20
  `;
  const leadTimes = rows.map(r => Number(r.lead_time_hours));
  const avgLead = leadTimes.reduce((a,b)=>a+b,0)/leadTimes.length;
  return NextResponse.json({ avg_lead_time_hours: avgLead, min: Math.min(...leadTimes), max: Math.max(...leadTimes), sample: rows.slice(0,10) });
}
