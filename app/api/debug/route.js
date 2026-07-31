// app/api/debug/route.js — TEMPORAIRE
import { NextResponse } from "next/server";
import { fetchNtpRaw, parseNtpCsv } from "../../../lib/netztransparenz";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") || "data/NrvSaldo/reBAP/Qualitaetsgesichert";
  const dateFrom = searchParams.get("from") || "2026-07-29T00:00:00";
  const dateTo = searchParams.get("to") || "2026-07-30T00:00:00";

  try {
    const raw = await fetchNtpRaw(path, dateFrom, dateTo);
    const parsed = parseNtpCsv(raw);
    return NextResponse.json({
      path,
      raw_preview: raw.slice(0, 1500),
      raw_length: raw.length,
      headers: parsed.headers,
      n_rows: parsed.rows.length,
      sample_rows: parsed.rows.slice(0, 5),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
