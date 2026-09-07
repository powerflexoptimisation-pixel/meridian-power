import { NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
export const dynamic = "force-dynamic";
function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get("secret") === secret;
}
export async function GET(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getSql();
  const result = await sql`DELETE FROM own_wind_solar_forecast WHERE fuel_type = 'Solar'`;
  return NextResponse.json({ ok: true, deleted: result.length ?? result.count ?? "unknown" });
}
