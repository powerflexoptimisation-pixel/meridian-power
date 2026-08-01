// lib/collect-de.js
// Logique de collecte netztransparenz.de partagée entre:
// - app/api/cron/collect (cron quotidien Vercel, couvre ENTSO-E + toutes
//   les séries DE, y compris les qualitätsgesichert à fenêtre décalée)
// - app/api/cron/collect-de-realtime (appelé toutes les 15 min par un
//   scheduler externe — Vercel Hobby plafonne son propre cron à 1x/jour,
//   voir README — ne couvre que les séries publiées en continu)

import {
  fetchRedispatch, fetchReBAP, fetchRZSaldo, fetchAepSchaetzer,
  fetchActivatedAFRR, fetchActivatedMFRR, fetchNRVSaldo, fetchTrafficLight,
  fetchIdAep, fetchNegativePreise, fetchHochrechnungSolar, fetchHochrechnungWind,
} from "./netztransparenz";
import {
  upsertRedispatch, upsertReBAP, upsertAepSchaetzer, upsertRZSaldo,
  upsertActivatedAFRR, upsertActivatedMFRR, upsertNRVSaldo, upsertTrafficLight,
  upsertIdAep, upsertNegativePreise, upsertHochrechnungSolar, upsertHochrechnungWind,
  logDeCollection,
} from "./db";

const DE_FETCHERS = {
  redispatch: fetchRedispatch,
  rebap: fetchReBAP,
  aep_schaetzer: fetchAepSchaetzer,
  rz_saldo: fetchRZSaldo,
  activated_afrr: fetchActivatedAFRR,
  activated_mfrr: fetchActivatedMFRR,
  nrv_saldo: fetchNRVSaldo,
  traffic_light: fetchTrafficLight,
  id_aep: fetchIdAep,
  negative_preise: fetchNegativePreise,
  hochrechnung_solar: fetchHochrechnungSolar,
  hochrechnung_wind: fetchHochrechnungWind,
};

const DE_UPSERTERS = {
  redispatch: upsertRedispatch,
  rebap: upsertReBAP,
  aep_schaetzer: upsertAepSchaetzer,
  rz_saldo: upsertRZSaldo,
  activated_afrr: upsertActivatedAFRR,
  activated_mfrr: upsertActivatedMFRR,
  nrv_saldo: upsertNRVSaldo,
  traffic_light: upsertTrafficLight,
  id_aep: upsertIdAep,
  negative_preise: upsertNegativePreise,
  hochrechnung_solar: upsertHochrechnungSolar,
  hochrechnung_wind: upsertHochrechnungWind,
};

// Séries publiées en continu ("betrieblich") — fenêtre 24h glissante
// suffit, se prêtent bien à une collecte toutes les 15 min. Ce sont
// toutes les signaux directement utiles pour le trading/l'optimisation
// (déséquilibre système, tension réseau, prix intraday avancé, prévisions
// renouvelables temps réel).
export const REALTIME_DE_SERIES = [
  "redispatch", "aep_schaetzer", "rz_saldo", "nrv_saldo", "traffic_light",
  "id_aep", "hochrechnung_solar", "hochrechnung_wind",
];

// Séries "qualitätsgesichert" publiées avec retard — inutile de les
// interroger toutes les 15 min (le retard se compte en jours/semaines),
// couvertes une fois par jour par le cron principal. Fenêtres décalées
// observées empiriquement (pas documentées précisément par
// netztransparenz.de): reBAP ~10-14 jours, aFRR/mFRR ~5-6 semaines.
export const DELAYED_DE_SERIES = ["rebap", "activated_afrr", "activated_mfrr"];

// NegativePreise: pas de retard connu (données constatées à l'heure), mais
// pas besoin non plus de la rafraîchir toutes les 15 min — une fois par
// jour suffit largement (peu de changement d'une exécution à l'autre en
// heures pleines). On la sort du "temps réel 15 min" pour économiser des
// appels API inutiles.
export const DAILY_ONLY_DE_SERIES = ["negative_preise"];

const DELAYED_WINDOWS = {
  rebap: { fromDays: 21, toDays: 3 },
  activated_afrr: { fromDays: 60, toDays: 30 },
  activated_mfrr: { fromDays: 60, toDays: 30 },
};

// Collecte et persiste la liste de séries demandée, chacune avec la fenêtre
// adaptée à son cycle de publication. Un seul appel réseau par série.
export async function collectDeSeries(seriesList) {
  const now = new Date();
  const realtimeFrom = new Date(now.getTime() - 24 * 3600 * 1000);
  // +48h et non "now": RZ-Saldo/AEP-Schätzer/NRV-Saldo/etc. n'ont de toute
  // façon rien au-delà de "maintenant" (pas des prévisions), mais Redispatch
  // publie parfois des mesures déjà planifiées pour le lendemain — on les
  // capture dès leur annonce plutôt que d'attendre le jour J.
  const realtimeTo = new Date(now.getTime() + 48 * 3600 * 1000);
  // negative_preise: pas de contrainte de fraîcheur, on regarde une fenêtre
  // large (90j) pour un historique utile côté dashboard dès le premier run.
  const dailyFrom = new Date(now.getTime() - 90 * 24 * 3600 * 1000);

  const summary = {};
  for (const series of seriesList) {
    const delayed = DELAYED_WINDOWS[series];
    let from, to;
    if (delayed) {
      from = new Date(now.getTime() - delayed.fromDays * 24 * 3600 * 1000);
      to = new Date(now.getTime() - delayed.toDays * 24 * 3600 * 1000);
    } else if (DAILY_ONLY_DE_SERIES.includes(series)) {
      from = dailyFrom;
      to = now;
    } else {
      from = realtimeFrom;
      to = realtimeTo;
    }
    try {
      const data = await DE_FETCHERS[series](from, to);
      const stored = await DE_UPSERTERS[series](data);
      await logDeCollection(series, stored, null);
      summary[series] = { stored, error: null };
    } catch (err) {
      const errMsg = String(err.message || err);
      await logDeCollection(series, 0, errMsg);
      summary[series] = { stored: 0, error: errMsg };
    }
  }
  return summary;
}
