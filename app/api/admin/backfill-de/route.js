// app/api/admin/backfill-de/route.js
// Usage: /api/admin/backfill-de?secret=...
// Backfill initial du Redispatch allemand (netztransparenz.de). Contrairement
// à ENTSO-E, cet endpoint renvoie tout l'historique en un seul appel (pas de
// pagination par jour nécessaire) — voir lib/netztransparenz.js pour le détail.
// Les autres séries (reBAP, AEP-Schätzer, RZ-Saldo, activations aFRR/mFRR)
// sont bloquées tant que le rôle NrvSaldo n'est pas activé dans l'OAuth-Manager
// de netztransparenz.de ; ce backfill ne couvre donc que le redispatch pour
// l'instant. Relancer cette route une fois l'accès étendu pour aussi remplir
// l'historique des autres séries (à ajouter alors, elles ont leur propre
// pagination par date comme ENTSO-E).

import { NextResponse } from "next/server";
import { fetchRedispatchAll } from "../../../../lib/netztransparenz";
import { upsertRedispatch, logDeCollection } from "../../../../lib/db";

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

  try {
    const events = await fetchRedispatchAll();
    const stored = await upsertRedispatch(events);
    await logDeCollection("redispatch", stored, false, "backfill initial (historique complet)");
    return NextResponse.json({ done_at: new Date().toISOString(), series: "redispatch", events_fetched: events.length, events_stored: stored });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
