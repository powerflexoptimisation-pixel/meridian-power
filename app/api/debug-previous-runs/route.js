import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const url = "https://previous-runs-api.open-meteo.com/v1/forecast?latitude=52.6&longitude=9.0&hourly=wind_speed_100m,wind_speed_100m_previous_day1&models=dwd_icon_d2&past_days=31&forecast_days=1&wind_speed_unit=ms&timezone=UTC";
  try {
    const res = await fetch(url);
    const json = await res.json();
    const h = json.hourly || {};
    return NextResponse.json({
      status: res.status,
      keys: Object.keys(h),
      len: h.time?.length,
      first: { time: h.time?.[0], wind_speed_100m: h.wind_speed_100m?.[0], wind_speed_100m_previous_day1: h.wind_speed_100m_previous_day1?.[0] },
      sampleMid: h.time ? { time: h.time[Math.floor(h.time.length/2)], wind_speed_100m: h.wind_speed_100m?.[Math.floor(h.time.length/2)], wind_speed_100m_previous_day1: h.wind_speed_100m_previous_day1?.[Math.floor(h.time.length/2)] } : null,
      raw_error: json.reason || json.error,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
