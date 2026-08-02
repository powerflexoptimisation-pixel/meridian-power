// app/api/admin/compact-old-data/route.js
// Usage: /api/admin/compact-old-data?days=120&secret=...
// Politique de rétention: au-delà de `days` jours, les données 15-min sont
// compactées en moyennes horaires (÷4 sur le volume) dans les 4 plus
// grosses tables (market_prices, market_load, market_generation,
// market_wind_solar_forecast — ~99% du stockage total au moment de la mise
// en place de cette politique). Préserve la capacité d'analyse long terme
// (ex: Generation Forecast Analysis sur 365j) tout en évitant la
// croissance illimitée du stockage. Idempotent: ré-exécuter sur des
// données déjà compactées (ts déjà arrondi à l'heure) ne change rien
// (moyenne d'un seul point = lui-même) — donc safe à planifier en tâche
// récurrente (voir .github/workflows/compact-old-data.yml).
//
// `days` doit rester >= la fenêtre utilisée par la calibration du modèle
// de prévision maison (actuellement 120j, voir /api/admin/calibrate-own-
// forecast) — sous peine de dégrader la précision de calibration.

import { NextResponse } from "next/server";
import { getSql } from "../../../../lib/db";

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
  const days = Math.max(Number(searchParams.get("days") || "120"), 30);
  const sql = getSql();
  const results = {};

  // --- market_prices (country, ts, price_eur_mwh) ---
  try {
    const before = await sql`SELECT COUNT(*) AS n FROM market_prices WHERE ts < now() - (${days} || ' days')::interval`;
    await sql`
      WITH agg AS (
        SELECT country, date_trunc('hour', ts) AS hts, AVG(price_eur_mwh) AS v
        FROM market_prices
        WHERE ts < now() - (${days} || ' days')::interval
        GROUP BY country, date_trunc('hour', ts)
      ), del AS (
        DELETE FROM market_prices WHERE ts < now() - (${days} || ' days')::interval
      )
      INSERT INTO market_prices (country, ts, price_eur_mwh)
      SELECT country, hts, v FROM agg
      ON CONFLICT (country, ts) DO UPDATE SET price_eur_mwh = EXCLUDED.price_eur_mwh
    `;
    const after = await sql`SELECT COUNT(*) AS n FROM market_prices WHERE ts < now() - (${days} || ' days')::interval`;
    results.market_prices = { rows_before: Number(before[0].n), rows_after: Number(after[0].n) };
  } catch (err) {
    results.market_prices = { error: String(err.message || err) };
  }

  // --- market_load (country, ts, load_mw) ---
  try {
    const before = await sql`SELECT COUNT(*) AS n FROM market_load WHERE ts < now() - (${days} || ' days')::interval`;
    await sql`
      WITH agg AS (
        SELECT country, date_trunc('hour', ts) AS hts, AVG(load_mw) AS v
        FROM market_load
        WHERE ts < now() - (${days} || ' days')::interval
        GROUP BY country, date_trunc('hour', ts)
      ), del AS (
        DELETE FROM market_load WHERE ts < now() - (${days} || ' days')::interval
      )
      INSERT INTO market_load (country, ts, load_mw)
      SELECT country, hts, v FROM agg
      ON CONFLICT (country, ts) DO UPDATE SET load_mw = EXCLUDED.load_mw
    `;
    const after = await sql`SELECT COUNT(*) AS n FROM market_load WHERE ts < now() - (${days} || ' days')::interval`;
    results.market_load = { rows_before: Number(before[0].n), rows_after: Number(after[0].n) };
  } catch (err) {
    results.market_load = { error: String(err.message || err) };
  }

  // --- market_generation (country, ts, fuel_type, quantity_mw) ---
  try {
    const before = await sql`SELECT COUNT(*) AS n FROM market_generation WHERE ts < now() - (${days} || ' days')::interval`;
    await sql`
      WITH agg AS (
        SELECT country, date_trunc('hour', ts) AS hts, fuel_type, AVG(quantity_mw) AS v
        FROM market_generation
        WHERE ts < now() - (${days} || ' days')::interval
        GROUP BY country, date_trunc('hour', ts), fuel_type
      ), del AS (
        DELETE FROM market_generation WHERE ts < now() - (${days} || ' days')::interval
      )
      INSERT INTO market_generation (country, ts, fuel_type, quantity_mw)
      SELECT country, hts, fuel_type, v FROM agg
      ON CONFLICT (country, ts, fuel_type) DO UPDATE SET quantity_mw = EXCLUDED.quantity_mw
    `;
    const after = await sql`SELECT COUNT(*) AS n FROM market_generation WHERE ts < now() - (${days} || ' days')::interval`;
    results.market_generation = { rows_before: Number(before[0].n), rows_after: Number(after[0].n) };
  } catch (err) {
    results.market_generation = { error: String(err.message || err) };
  }

  // --- market_wind_solar_forecast (country, ts, fuel_type, quantity_mw) ---
  try {
    const before = await sql`SELECT COUNT(*) AS n FROM market_wind_solar_forecast WHERE ts < now() - (${days} || ' days')::interval`;
    await sql`
      WITH agg AS (
        SELECT country, date_trunc('hour', ts) AS hts, fuel_type, AVG(quantity_mw) AS v
        FROM market_wind_solar_forecast
        WHERE ts < now() - (${days} || ' days')::interval
        GROUP BY country, date_trunc('hour', ts), fuel_type
      ), del AS (
        DELETE FROM market_wind_solar_forecast WHERE ts < now() - (${days} || ' days')::interval
      )
      INSERT INTO market_wind_solar_forecast (country, ts, fuel_type, quantity_mw)
      SELECT country, hts, fuel_type, v FROM agg
      ON CONFLICT (country, ts, fuel_type) DO UPDATE SET quantity_mw = EXCLUDED.quantity_mw
    `;
    const after = await sql`SELECT COUNT(*) AS n FROM market_wind_solar_forecast WHERE ts < now() - (${days} || ' days')::interval`;
    results.market_wind_solar_forecast = { rows_before: Number(before[0].n), rows_after: Number(after[0].n) };
  } catch (err) {
    results.market_wind_solar_forecast = { error: String(err.message || err) };
  }

  await sql`VACUUM ANALYZE market_prices, market_load, market_generation, market_wind_solar_forecast`.catch(() => {});

  return NextResponse.json({ done_at: new Date().toISOString(), retention_days: days, results });
}
