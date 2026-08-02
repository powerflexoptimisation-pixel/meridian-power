import { NextResponse } from "next/server";
import { getSql, getForecastModel } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = getSql();
  const modelRows = await sql`SELECT * FROM own_forecast_model ORDER BY updated_at DESC`;
  const forecastRows = await sql`SELECT * FROM own_wind_solar_forecast WHERE fuel_type = 'Wind Offshore' ORDER BY ts LIMIT 5`;
  const viaFn = await getForecastModel("DE", "Wind Offshore");
  return NextResponse.json({ modelRows, forecastRows, viaFn });
}
