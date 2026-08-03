import { NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = getSql();
  try {
    const rows = await sql`SELECT fuel_type, COUNT(*) as n, SUM(weight_kw) as total_kw FROM mastr_wind_grid GROUP BY fuel_type`;
    return NextResponse.json({ exists: true, rows });
  } catch (err) {
    return NextResponse.json({ exists: false, error: String(err.message || err) });
  }
}
