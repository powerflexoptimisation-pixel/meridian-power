// app/api/netztransparenz/route.js
// Usage:
//   /api/netztransparenz?from=2026-06-24&to=2026-06-24            (jour, 00:00-24:00 Berlin)
//   /api/netztransparenz?fromDt=2026-06-24T08:00&toDt=2026-07-10T20:00  (plage précise, priorité sur from/to)
// (aucun paramètre -> mode live : les 2 derniers jours disponibles pour les
// séries temps réel, fenêtre élargie pour les séries qualitätsgesichert
// retardées — voir plus bas)
// Données spécifiques à l'Allemagne (source: les 4 GRT allemands via
// netztransparenz.de), récupérées à la volée (pas stockées en base pour ce
// endpoint — la persistence Postgres est gérée séparément par le cron).
// Renvoie: reBAP, AEP-Schätzer, RZ-Saldo, aFRR/mFRR activés (qualité-gérée),
// et redispatch.

import { NextResponse } from "next/server";
import {
  fetchReBAP, fetchRZSaldo, fetchRedispatch, fetchAepSchaetzer,
  fetchActivatedAFRR, fetchActivatedMFRR, fetchNRVSaldo, fetchTrafficLight,
  fetchIdAep, fetchNegativePreise, fetchHochrechnungSolar, fetchHochrechnungWind,
} from "../../../lib/netztransparenz";
import { berlinDateToUTC, berlinDateTimeToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const fromDtParam = searchParams.get("fromDt");
  const toDtParam = searchParams.get("toDt");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Plage précise (datetime-local, saisie par l'utilisateur depuis le
  // dashboard) : prioritaire sur from/to (jour entier) et sur le calcul
  // automatique des fenêtres qualitätsgesichert — l'utilisateur reprend
  // explicitement la main sur toutes les séries.
  const isCustomRange = !!(fromDtParam && toDtParam);
  const isLive = !isCustomRange && !(fromParam && toParam);

  let from, to;
  if (isCustomRange) {
    from = berlinDateTimeToUTC(fromDtParam);
    to = berlinDateTimeToUTC(toDtParam);
  } else if (!isLive) {
    from = berlinDateToUTC(fromParam);
    to = new Date(berlinDateToUTC(toParam).getTime() + 24 * 3600 * 1000);
  } else {
    // Mode live: les 2 derniers jours disponibles (fenêtre glissante de 48h
    // jusqu'à maintenant). RZ-Saldo/AEP-Schätzer/NRV-Saldo/etc. n'ont de
    // toute façon rien au-delà de "maintenant" (pas des prévisions). Pour
    // voir des mesures Redispatch déjà planifiées au-delà d'aujourd'hui,
    // utiliser une plage explicite (from/to ou fromDt/toDt).
    to = new Date();
    from = new Date(to.getTime() - 2 * 24 * 3600 * 1000);
  }
  if (Number.isNaN(from?.getTime()) || Number.isNaN(to?.getTime()) || from >= to) {
    return NextResponse.json({ error: "Plage de dates invalide." }, { status: 400 });
  }

  const maxRangeDays = isCustomRange ? 120 : 8;
  if (to.getTime() - from.getTime() > maxRangeDays * 24 * 3600 * 1000) {
    return NextResponse.json({ error: `Plage limitée à ${maxRangeDays} jours.` }, { status: 400 });
  }

  // reBAP/aFRR/mFRR sont "qualitätsgesichert" et publiées avec retard. Si
  // l'utilisateur a choisi une plage précise (isCustomRange), on la respecte
  // telle quelle pour TOUTES les séries — c'est le but de ce contrôle
  // (pouvoir aller chercher, par ex., "il y a 6 semaines" où ces séries ont
  // effectivement des données). En mode live (aucune plage demandée), la
  // fenêtre "hier" serait quasi systématiquement vide pour ces 3 séries — on
  // élargit donc automatiquement. Délais observés empiriquement (pas
  // documentés précisément par netztransparenz.de): reBAP ~10-14 jours,
  // aFRR/mFRR significativement plus long (~5-6 semaines).
  const reBapFrom = isLive ? new Date(Date.now() - 21 * 24 * 3600 * 1000) : from;
  const reBapTo = isLive ? new Date(Date.now() - 3 * 24 * 3600 * 1000) : to;
  const activationFrom = isLive ? new Date(Date.now() - 60 * 24 * 3600 * 1000) : from;
  const activationTo = isLive ? new Date(Date.now() - 30 * 24 * 3600 * 1000) : to;

  try {
    const [
      reBAP, rzSaldo, redispatch, aepSchaetzer, activatedAFRR, activatedMFRR,
      nrvSaldo, trafficLight, idAep, negativePreise, hochrechnungSolar, hochrechnungWind,
    ] = await Promise.all([
      fetchReBAP(reBapFrom, reBapTo),
      fetchRZSaldo(from, to),
      fetchRedispatch(from, to),
      fetchAepSchaetzer(from, to),
      fetchActivatedAFRR(activationFrom, activationTo),
      fetchActivatedMFRR(activationFrom, activationTo),
      fetchNRVSaldo(from, to),
      fetchTrafficLight(from, to),
      fetchIdAep(from, to),
      fetchNegativePreise(from, to),
      fetchHochrechnungSolar(from, to),
      fetchHochrechnungWind(from, to),
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
      reBapFrom: reBapFrom.toISOString(),
      reBapTo: reBapTo.toISOString(),
      activationFrom: activationFrom.toISOString(),
      activationTo: activationTo.toISOString(),
      reBAP,
      rzSaldo,
      redispatch,
      redispatchSummary,
      aepSchaetzer,
      activatedAFRR,
      activatedMFRR,
      nrvSaldo,
      trafficLight,
      idAep,
      negativePreise,
      hochrechnungSolar,
      hochrechnungWind,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
