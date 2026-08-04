// app/api/admin/init-portfolio-schema/route.js
// Usage: /api/admin/init-portfolio-schema?secret=...
// Applique (idempotent) les tables du module Portfolio Management
// (assets, ppa_contracts, asset_positions, bess_dispatch, flex_availability)
// contre la base Neon de production. Suit le même pattern que
// /api/admin/init-schema.

import { NextResponse } from "next/server";
import { getSql } from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || searchParams.get("secret") === secret;
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS assets (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(160) NOT NULL,
    asset_type      VARCHAR(20) NOT NULL,
    country         VARCHAR(2) NOT NULL,
    tso             VARCHAR(40),
    capacity_mw     NUMERIC(10, 3) NOT NULL,
    capacity_mwh    NUMERIC(10, 3),
    commissioning_date DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'operational',
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE assets ADD COLUMN IF NOT EXISTS tso VARCHAR(40)`,
  `CREATE INDEX IF NOT EXISTS idx_assets_country_type ON assets (country, asset_type)`,
  `CREATE INDEX IF NOT EXISTS idx_assets_tso ON assets (tso)`,
  `CREATE TABLE IF NOT EXISTS ppa_contracts (
    id                SERIAL PRIMARY KEY,
    asset_id          INTEGER REFERENCES assets(id) ON DELETE SET NULL,
    counterparty      VARCHAR(160) NOT NULL,
    structure         VARCHAR(20) NOT NULL,
    strike_price_eur_mwh NUMERIC(10, 2),
    cap_eur_mwh       NUMERIC(10, 2),
    floor_eur_mwh     NUMERIC(10, 2),
    volume_mw         NUMERIC(10, 3),
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    country           VARCHAR(2) NOT NULL,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ppa_asset ON ppa_contracts (asset_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ppa_dates ON ppa_contracts (start_date, end_date)`,
  `CREATE TABLE IF NOT EXISTS asset_positions (
    asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    ts              TIMESTAMPTZ NOT NULL,
    output_mw       NUMERIC(10, 3) NOT NULL,
    PRIMARY KEY (asset_id, ts)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_positions_asset_ts ON asset_positions (asset_id, ts)`,
  `CREATE TABLE IF NOT EXISTS bess_dispatch (
    asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    ts              TIMESTAMPTZ NOT NULL,
    power_mw        NUMERIC(10, 3) NOT NULL,
    soc_mwh         NUMERIC(10, 3),
    mode            VARCHAR(20) NOT NULL DEFAULT 'planned',
    PRIMARY KEY (asset_id, ts, mode)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bess_asset_ts ON bess_dispatch (asset_id, ts)`,
  `CREATE TABLE IF NOT EXISTS flex_availability (
    id                SERIAL PRIMARY KEY,
    asset_id          INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    start_ts          TIMESTAMPTZ NOT NULL,
    end_ts            TIMESTAMPTZ NOT NULL,
    available_mw      NUMERIC(10, 3) NOT NULL,
    activation_cost_eur_mwh NUMERIC(10, 2),
    direction         VARCHAR(10) NOT NULL DEFAULT 'down',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_flex_asset_window ON flex_availability (asset_id, start_ts, end_ts)`,
];

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sql = getSql();
  const results = [];
  for (const stmt of STATEMENTS) {
    try {
      await sql(stmt);
      results.push({ ok: true, stmt: stmt.trim().slice(0, 60) + "..." });
    } catch (err) {
      results.push({ ok: false, stmt: stmt.trim().slice(0, 60) + "...", error: String(err.message || err) });
    }
  }
  return NextResponse.json({ done_at: new Date().toISOString(), results });
}
