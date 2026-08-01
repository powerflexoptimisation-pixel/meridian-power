// app/api/cron/collect-de-realtime/route.js
// Collecte allégée (Redispatch, AEP-Schätzer, RZ-Saldo — les 3 séries
// publiées en continu, "betrieblich") destinée à être appelée toutes les
// 15 min par un scheduler EXTERNE (GitHub Actions, voir
// .github/workflows/collect-de-realtime.yml — Vercel Hobby plafonne son
// propre cron à 1x/jour, cette route contourne cette limite en restant un
// endpoint HTTP standard appelable depuis n'importe où).
// reBAP/aFRR/mFRR (qualitätsgesichert, retard de jours/semaines) ne sont
// PAS inclus ici — inutile de les interroger si souvent, elles restent
// couvertes une fois par jour par /api/cron/collect.

import { NextResponse } from "next/server";
import { collectDeSeries, REALTIME_DE_SERIES } from "../../../../lib/collect-de";

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
    const de = await collectDeSeries(REALTIME_DE_SERIES);
    return NextResponse.json({ ran_at: new Date().toISOString(), de });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err), stack: err.stack }, { status: 500 });
  }
}
