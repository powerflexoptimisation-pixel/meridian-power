import { NextResponse } from "next/server";
import { getMastrGrid } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const onshore = await getMastrGrid("Wind Onshore");
  const offshore = await getMastrGrid("Wind Offshore");
  const totalOnshoreMw = onshore.reduce((s, c) => s + c.weight, 0) / 1000;
  const totalOffshoreMw = offshore.reduce((s, c) => s + c.weight, 0) / 1000;
  return NextResponse.json({
    onshore: { cells: onshore.length, total_mw: Math.round(totalOnshoreMw), top5: onshore.slice(0, 5) },
    offshore: { cells: offshore.length, total_mw: Math.round(totalOffshoreMw), top5: offshore.slice(0, 5) },
  });
}
