import { NextResponse } from "next/server";
import { fetchWeatherForecast } from "../../../lib/weather";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fuel = searchParams.get("fuel") || "Wind Offshore";
  const weather = await fetchWeatherForecast(fuel, 2);
  return NextResponse.json({ fuel, sample: weather.slice(0, 24) });
}
