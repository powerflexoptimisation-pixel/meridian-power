// app/api/netztransparenz/route.js
// Usage: /api/netztransparenz?from=2026-06-24&to=2026-06-24
// (from/to omis -> mode live : hier pour les séries temps réel, fenêtre
// élargie J-21 à J-3 pour les séries qualitätsgesichert retardées — voir
// commentaire plus bas)
// Données spécifiques à l'Allemagne (source: les 4 GRT allemands via
// netztransparenz.de), récupérées à la volée (pas stockées en base pour ce
// endpoint — la persistence Postgres est gérée séparément par le cron).
// Renvoie: reBAP, AEP-Schätzer, RZ-Saldo, aFRR/mFRR activés (qualité-gérée),
// et redispatch.

import { NextResponse } from "next/server";
import {
  fetchReBAP, fetchRZSaldo, fetchRedispatch, fetchAepSchaetzer,
  fetchActivatedAFRR, fetchActivatedMFRR,
} from "../../../lib/netztransparenz";
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
  const isLive = !(fromParam && toParam);
  if (!isLive) {
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

  // reBAP/aFRR/mFRR sont "qualitätsgesichert" et publiées avec ~10-14 jours
  // de retard. En mode live (pas de date explicite demandée), la fenêtre
  // "hier" serait quasi systématiquement vide pour ces 3 séries — on élargit
  // donc à J-21..J-3 pour qu'elles affichent réellement quelque chose par
  // défaut. En mode historique (date explicite choisie par l'utilisateur),
  // on respecte le jour demandé tel quel (peut être vide si trop récent,
  // même logique que le comportement reBAP existant).
  const delayedFrom = isLive ? new Date(Date.now() - 21 * 24 * 3600 * 1000) : from;
  const delayedTo = isLive ? new Date(Date.now() - 3 * 24 * 3600 * 1000) : to;

  try {
    const [reBAP, rzSaldo, redispatch, aepSchaetzer, activatedAFRR, activatedMFRR] = await Promise.all([
      fetchReBAP(delayedFrom, delayedTo),
      fetchRZSaldo(from, to),
      fetchRedispatch(from, to),
      fetchAepSchaetzer(from, to),
      fetchActivatedAFRR(delayedFrom, delayedTo),
      fetchActivatedMFRR(delayedFrom, delayedTo),
    ]);

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
      rzSaldo,
      redispatch,
      redispatchSummary,
      aepSchaetzer,
      activatedAFRR,
      activatedMFRR,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
