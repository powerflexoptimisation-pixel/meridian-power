// app/api/admin/init-schema/route.js
// Usage: /api/admin/init-schema?secret=...
// Applique (CREATE TABLE IF NOT EXISTS — idempotent, sans risque à
// ré-exécuter) les tables netztransparenz.de qui manquaient en prod:
// schema.sql avait été mis à jour dans le repo mais jamais exécuté contre
// la vraie base Neon, d'où l'erreur "relation de_collection_log does not
// exist" rencontrée par /api/cron/collect-de-realtime.

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
  `CREATE TABLE IF NOT EXISTS de_redispatch (
    id                SERIAL PRIMARY KEY,
    start_ts          TIMESTAMPTZ NOT NULL,
    end_ts            TIMESTAMPTZ NOT NULL,
    reason            VARCHAR(80),
    direction         VARCHAR(60),
    avg_power_mw      NUMERIC(10, 2),
    max_power_mw      NUMERIC(10, 2),
    total_energy_mwh  NUMERIC(12, 2),
    ordering_tso      VARCHAR(80),
    requesting_tso    VARCHAR(120),
    plant             VARCHAR(160),
    energy_source     VARCHAR(40),
    UNIQUE (start_ts, end_ts, requesting_tso, plant, direction)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_de_redispatch_start ON de_redispatch (start_ts)`,
  `CREATE TABLE IF NOT EXISTS de_rebap (
    ts                TIMESTAMPTZ PRIMARY KEY,
    rebap_unterdeckt  NUMERIC(10, 2),
    rebap_ueberdeckt  NUMERIC(10, 2)
  )`,
  `CREATE TABLE IF NOT EXISTS de_aep_schaetzer (
    ts                    TIMESTAMPTZ PRIMARY KEY,
    aep_schaetzer_eur_mwh NUMERIC(10, 2),
    status                VARCHAR(10)
  )`,
  `CREATE TABLE IF NOT EXISTS de_rz_saldo (
    ts          TIMESTAMPTZ NOT NULL,
    tso         VARCHAR(20) NOT NULL,
    value_mw    NUMERIC(10, 2) NOT NULL,
    PRIMARY KEY (ts, tso)
  )`,
  `CREATE TABLE IF NOT EXISTS de_activated_afrr (
    ts          TIMESTAMPTZ NOT NULL,
    zone        VARCHAR(20) NOT NULL,
    direction   VARCHAR(10) NOT NULL,
    value_mw    NUMERIC(10, 3) NOT NULL,
    PRIMARY KEY (ts, zone, direction)
  )`,
  `CREATE TABLE IF NOT EXISTS de_activated_mfrr (
    ts          TIMESTAMPTZ NOT NULL,
    zone        VARCHAR(20) NOT NULL,
    direction   VARCHAR(10) NOT NULL,
    value_mw    NUMERIC(10, 3) NOT NULL,
    PRIMARY KEY (ts, zone, direction)
  )`,
  `CREATE TABLE IF NOT EXISTS de_collection_log (
    id          SERIAL PRIMARY KEY,
    ran_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    series      VARCHAR(40) NOT NULL,
    points      INTEGER NOT NULL DEFAULT 0,
    blocked     BOOLEAN NOT NULL DEFAULT false,
    warning     TEXT
  )`,
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
