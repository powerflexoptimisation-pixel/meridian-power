import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const lats = "54.3,53.2,53.8";
  const lons = "9.5,8.0,12.5";
  const url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${lats}&longitude=${lons}&hourly=wind_speed_100m&forecast_days=2&timezone=UTC`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const isArray = Array.isArray(json);
    return NextResponse.json({ status: res.status, isArray, count: isArray ? json.length : null, sample: isArray ? json.map(j => ({ lat: j.latitude, lon: j.longitude, first_val: j.hourly?.wind_speed_100m?.[0] })) : json });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
