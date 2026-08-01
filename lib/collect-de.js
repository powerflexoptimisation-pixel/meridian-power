// lib/collect-de.js
// Logique de collecte netztransparenz.de partagée entre:
// - app/api/cron/collect (cron quotidien Vercel, couvre ENTSO-E + les 6
//   séries DE, y compris les qualitätsgesichert à fenêtre décalée)
// - app/api/cron/collect-de-realtime (appelé toutes les 15 min par un
//   scheduler externe — Vercel Hobby plafonne son propre cron à 1x/jour,
//   voir README — ne couvre que les 3 séries publiées en continu)

import {
  fetchRedispatch, fetchReBAP, fetchRZSaldo, fetchAepSchaetzer,
  fetchActivatedAFRR, fetchActivatedMFRR,
} from "./netztransparenz";
import {
  upsertRedispatch, upsertReBAP, upsertAepSchaetzer, upsertRZSaldo,
  upsertActivatedAFRR, upsertActivatedMFRR, logDeCollection,
} from "./db";

const DE_FETCHERS = {
  redispatch: fetchRedispatch,
  rebap: fetchReBAP,
  aep_schaetzer: fetchAepSchaetzer,
  rz_saldo: fetchRZSaldo,
  activated_afrr: fetchActivatedAFRR,
  activated_mfrr: fetchActivatedMFRR,
};

const DE_UPSERTERS = {
  redispatch: upsertRedispatch,
  rebap: upsertReBAP,
  aep_schaetzer: upsertAepSchaetzer,
  rz_saldo: upsertRZSaldo,
  activated_afrr: upsertActivatedAFRR,
  activated_mfrr: upsertActivatedMFRR,
};

// Séries publiées en continu ("betrieblich") — fenêtre 24h glissante
// suffit, se prêtent bien à une collecte toutes les 15 min.
export const REALTIME_DE_SERIES = ["redispatch", "aep_schaetzer", "rz_saldo"];

// Séries "qualitätsgesichert" publiées avec retard — inutile de les
// interroger toutes les 15 min (le retard se compte en jours/semaines),
// couvertes une fois par jour par le cron principal. Fenêtres décalées
// observées empiriquement (pas documentées précisément par
// netztransparenz.de): reBAP ~10-14 jours, aFRR/mFRR ~5-6 semaines.
export const DELAYED_DE_SERIES = ["rebap", "activated_afrr", "activated_mfrr"];

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
  // +48h et non "now": RZ-Saldo/AEP-Schätzer n'ont de toute façon rien
  // au-delà de "maintenant" (pas des prévisions), mais Redispatch publie
  // parfois des mesures déjà planifiées pour le lendemain — on les capture
  // dès leur annonce plutôt que d'attendre le jour J.
  const realtimeTo = new Date(now.getTime() + 48 * 3600 * 1000);

  const summary = {};
  for (const series of seriesList) {
    const delayed = DELAYED_WINDOWS[series];
    const from = delayed ? new Date(now.getTime() - delayed.fromDays * 24 * 3600 * 1000) : realtimeFrom;
    const to = delayed ? new Date(now.getTime() - delayed.toDays * 24 * 3600 * 1000) : realtimeTo;
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
