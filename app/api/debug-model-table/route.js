import { NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = getSql();
  const rows = await sql`SELECT * FROM own_forecast_model ORDER BY updated_at DESC`;
  return NextResponse.json({ count: rows.length, rows });
}
