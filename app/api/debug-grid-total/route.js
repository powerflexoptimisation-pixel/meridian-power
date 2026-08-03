import { NextResponse } from "next/server";
import { getWindGrid } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const grid = await getWindGrid("osm", 1000);
  const totalCapacity = grid.reduce((s, c) => s + c.weight, 0);
  const totalTurbines = grid.reduce((s, c) => s + c.turbineCount, 0);
  return NextResponse.json({ cells: grid.length, total_capacity_mw: Math.round(totalCapacity), total_turbines: totalTurbines, top10: grid.slice(0, 10) });
}
