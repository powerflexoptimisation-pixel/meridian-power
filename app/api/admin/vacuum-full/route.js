import { NextResponse } from "next/server";
import { getSql } from "../../../../lib/db";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || searchParams.get("secret") === secret;
}

export async function GET(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table") || "market_generation";
  const sql = getSql();
  try {
    const start = Date.now();
    await sql(`VACUUM FULL ${table}`);
    return NextResponse.json({ ok: true, table, ms: Date.now() - start });
  } catch (err) {
    return NextResponse.json({ ok: false, table, error: String(err.message || err) }, { status: 500 });
  }
}
