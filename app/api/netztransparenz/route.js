// app/api/netztransparenz/route.js
// Usage: /api/netztransparenz?from=2026-06-24&to=2026-06-24
// (from/to omis -> hier ; max 7 jours)
// Données spécifiques à l'Allemagne (source: les 4 GRT allemands via
// netztransparenz.de), récupérées à la volée (pas stockées en base).
// Renvoie: reBAP (prix de compensation, 15-min), RZ-Saldo (solde par GRT),
// et redispatch (événements de congestion sur la période).

import { NextResponse } from "next/server";
import { fetchReBAP, fetchRZSaldo, fetchRedispatch } from "../../../lib/netztransparenz";
import { berlinMidnightUTC, berlinDateToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  let from, to;
  if (fromParam && toParam) {
    from = berlinDateToUTC(fromParam);
    to = new Date(berlinDateToUTC(toParam).getTime() + 24 * 3600 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ error: "Plage from/to invalide (format attendu: YYYY-MM-DD)." }, { status: 400 });
    }
  } else {
    to = berlinMidnightUTC(0);
    from = berlinMidnightUTC(1);
  }

  if (to.getTime() - from.getTime() > 8 * 24 * 3600 * 1000) {
    return NextResponse.json({ error: "Plage limitée à 7 jours." }, { status: 400 });
  }

  try {
    const [reBAPRes, rzSaldoRes, redispatchRes] = await Promise.all([
      fetchReBAP(from, to),
      fetchRZSaldo(from, to),
      fetchRedispatch(from, to),
    ]);

    const reBAP = reBAPRes.data;
    const rzSaldo = rzSaldoRes.data;
    const redispatch = redispatchRes.data;

    const redispatchSummary = {
      count: redispatch.length,
      totalEnergyMwh: redispatch.reduce((s, r) => s + (r.totalEnergyMwh || 0), 0),
      byReason: redispatch.reduce((acc, r) => {
        const key = r.reason || "Inconnu";
        acc[key] = (acc[key] || 0) + (r.totalEnergyMwh || 0);
        return acc;
      }, {}),
    };

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      reBAP,
      reBAPBlocked: reBAPRes.notFound,
      rzSaldo,
      rzSaldoBlocked: rzSaldoRes.notFound,
      redispatch,
      redispatchSummary,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
