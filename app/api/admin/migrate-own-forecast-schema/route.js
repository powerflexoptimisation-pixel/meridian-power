// app/api/admin/migrate-own-forecast-schema/route.js
// Migration ponctuelle (à supprimer après exécution): l'ancien schéma de
// own_wind_solar_forecast avait pour PK (country, ts, fuel_type) et
// écrasait la prévision à chaque run — les données existantes sont donc
// structurellement compromises (mélange de vintages, voir diagnostic).
// On repart propre avec le nouveau schéma (PK incluant generated_at).
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

export async function GET(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getSql();
  await sql`DROP TABLE IF EXISTS own_wind_solar_forecast`;
  await sql`
    CREATE TABLE own_wind_solar_forecast (
      country      VARCHAR(2) NOT NULL,
      ts           TIMESTAMPTZ NOT NULL,
      fuel_type    VARCHAR(20) NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL,
      quantity_mw  NUMERIC(10, 2) NOT NULL,
      PRIMARY KEY (country, ts, fuel_type, generated_at)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_own_forecast_country_ts ON own_wind_solar_forecast (country, ts)`;
  return NextResponse.json({ ok: true, message: "Table recréée avec le nouveau schéma (PK incluant generated_at)" });
}
