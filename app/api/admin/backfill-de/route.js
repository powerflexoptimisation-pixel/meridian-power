// app/api/admin/backfill-de/route.js
// Usage: /api/admin/backfill-de?secret=...&days=120
// Backfill initial de toutes les séries netztransparenz.de.
// - Redispatch: endpoint renvoie tout l'historique en un seul appel (pas de
//   pagination nécessaire, indépant du paramètre days).
// - reBAP, RZ-Saldo, AEP-Schätzer, aFRR/mFRR activés: récupérés sur la
//   fenêtre [now - days, now] en un seul appel chacun (l'API accepte de
//   grandes plages sans pagination contrairement à ENTSO-E). Attention:
//   reBAP et aFRR/mFRR sont des données "qualitätsgesichert" publiées avec
//   ~10 jours de retard — utiliser days >= 30 pour capturer un historique
//   utile de ces 3 séries.

import { NextResponse } from "next/server";
import {
  fetchRedispatchAll, fetchReBAP, fetchRZSaldo, fetchAepSchaetzer,
  fetchActivatedAFRR, fetchActivatedMFRR,
} from "../../../../lib/netztransparenz";
import {
  upsertRedispatch, upsertReBAP, upsertRZSaldo, upsertAepSchaetzer,
  upsertActivatedAFRR, upsertActivatedMFRR, logDeCollection,
} from "../../../../lib/db";

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
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(Number(searchParams.get("days") || "120"), 365);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);

  const jobs = {
    redispatch: async () => upsertRedispatch(await fetchRedispatchAll()),
    rebap: async () => upsertReBAP(await fetchReBAP(from, to)),
    rz_saldo: async () => upsertRZSaldo(await fetchRZSaldo(from, to)),
    aep_schaetzer: async () => upsertAepSchaetzer(await fetchAepSchaetzer(from, to)),
    activated_afrr: async () => upsertActivatedAFRR(await fetchActivatedAFRR(from, to)),
    activated_mfrr: async () => upsertActivatedMFRR(await fetchActivatedMFRR(from, to)),
  };

  const summary = {};
  for (const [series, run] of Object.entries(jobs)) {
    try {
      const stored = await run();
      await logDeCollection(series, stored, "backfill initial");
      summary[series] = { stored, error: null };
    } catch (err) {
      summary[series] = { stored: 0, error: String(err.message || err) };
    }
  }

  return NextResponse.json({ done_at: new Date().toISOString(), days_requested: days, from: from.toISOString(), to: to.toISOString(), summary });
}
