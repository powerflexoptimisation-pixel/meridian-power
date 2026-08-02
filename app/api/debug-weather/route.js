import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat") || "54.3";
  const lon = searchParams.get("lon") || "9.5";
  const url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${lat}&longitude=${lon}&hourly=wind_speed_100m,wind_speed_10m,shortwave_radiation,cloud_cover,temperature_2m&forecast_days=3&timezone=UTC`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    return NextResponse.json({ status: res.status, keys: Object.keys(json), hourly_keys: json.hourly ? Object.keys(json.hourly) : null, sample: json.hourly ? { time: json.hourly.time.slice(0,3), wind_speed_100m: json.hourly.wind_speed_100m?.slice(0,3), shortwave_radiation: json.hourly.shortwave_radiation?.slice(0,3) } : json });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
