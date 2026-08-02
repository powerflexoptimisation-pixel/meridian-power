import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "forecast";
  const lat = searchParams.get("lat") || "54.3";
  const lon = searchParams.get("lon") || "9.5";
  let url;
  if (mode === "historical") {
    const start = searchParams.get("start") || "2025-08-01";
    const end = searchParams.get("end") || "2025-08-05";
    url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&hourly=wind_speed_100m,wind_speed_10m,shortwave_radiation,cloud_cover,temperature_2m&timezone=UTC`;
  } else {
    url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${lat}&longitude=${lon}&hourly=wind_speed_100m,wind_speed_10m,shortwave_radiation,cloud_cover,temperature_2m&forecast_days=3&timezone=UTC`;
  }
  try {
    const res = await fetch(url);
    const json = await res.json();
    return NextResponse.json({ status: res.status, hourly_len: json.hourly?.time?.length, sample_first: json.hourly ? { time: json.hourly.time[0], wind_speed_100m: json.hourly.wind_speed_100m?.[0], shortwave_radiation: json.hourly.shortwave_radiation?.[0] } : null, sample_last: json.hourly ? { time: json.hourly.time[json.hourly.time.length-1] } : null, error: json.error, reason: json.reason });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
