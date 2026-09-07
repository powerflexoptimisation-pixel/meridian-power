import { NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = getSql();
  const raw = await sql`
    SELECT ts, product, tso, value_mw FROM de_hochrechnung
    WHERE ts = '2026-09-05T02:45:00.000Z' AND product = 'Wind'
    ORDER BY tso
  `;
  const entsoeAtSameTs = await sql`
    SELECT ts, fuel_type, quantity_mw FROM market_generation
    WHERE country='DE' AND ts = '2026-09-05T02:45:00.000Z' AND fuel_type LIKE 'Wind%'
  `;
  return NextResponse.json({ hochrechnung_wind_par_tso: raw, entsoe_wind: entsoeAtSameTs });
}
