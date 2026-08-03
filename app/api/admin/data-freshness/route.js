// app/api/admin/data-freshness/route.js
// Diagnostic: dernière donnée réellement en base par table clé, comparée
// à "maintenant" — indépendant de l'historique des runs GitHub Actions
// (qui montre QUAND un workflow s'est déclenché, pas si la donnée réelle
// est à jour).
import { NextResponse } from "next/server";
import { getSql } from "../../../../lib/db";
export const dynamic = "force-dynamic";

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || searchParams.get("secret") === secret;
}

const CHECKS = [
  { table: "market_prices", label: "Prix day-ahead (ENTSO-E)" },
  { table: "market_load", label: "Charge (ENTSO-E)" },
  { table: "market_generation", label: "Génération réalisée (ENTSO-E)" },
  { table: "market_wind_solar_forecast", label: "Prévision éolien/solaire ENTSO-E" },
  { table: "market_load_forecast", label: "Prévision de charge ENTSO-E" },
  { table: "own_wind_solar_forecast", label: "Prévision maison (Forecast for Trading)" },
  { table: "de_redispatch", label: "Redispatch (netztransparenz.de)" },
  { table: "de_aep_schaetzer", label: "AEP-Schätzer (netztransparenz.de)" },
  { table: "de_rz_saldo", label: "RZ-Saldo (netztransparenz.de)" },
  { table: "de_nrv_saldo", label: "NRV-Saldo (netztransparenz.de)" },
  { table: "de_traffic_light", label: "Traffic Light (netztransparenz.de)", tsCol: "ts_from" },
  { table: "de_id_aep", label: "ID AEP (netztransparenz.de)" },
  { table: "de_hochrechnung", label: "Hochrechnung Solar/Wind (netztransparenz.de)" },
  { table: "de_rebap", label: "reBAP (netztransparenz.de, qualitätsgesichert)" },
  { table: "de_activated_afrr", label: "aFRR activé (netztransparenz.de, qualitätsgesichert)" },
  { table: "de_activated_mfrr", label: "mFRR activé (netztransparenz.de, qualitätsgesichert)" },
  { table: "de_negative_preise", label: "Negative Preise (netztransparenz.de)" },
];

export async function GET(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getSql();
  const results = [];
  for (const c of CHECKS) {
    const tsCol = c.tsCol || "ts";
    try {
      const rows = await sql(
        `SELECT MAX(${tsCol}) AS latest, MIN(${tsCol}) AS earliest, COUNT(*) AS n FROM ${c.table}`
      );
      const r = rows[0];
      const latest = r.latest ? new Date(r.latest) : null;
      const ageHours = latest ? (Date.now() - latest.getTime()) / 3600000 : null;
      results.push({
        table: c.table,
        label: c.label,
        latest: latest ? latest.toISOString() : null,
        earliest: r.earliest ? new Date(r.earliest).toISOString() : null,
        rows: Number(r.n),
        age_hours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
      });
    } catch (err) {
      results.push({ table: c.table, label: c.label, error: String(err.message || err) });
    }
  }
  return NextResponse.json({ checked_at: new Date().toISOString(), results });
}
