// lib/portfolio.js
// Couche données pour le module Portfolio Management (PPA, wind/pv/BESS,
// flexible assets, DSM). Suit les mêmes conventions que lib/db.js
// (neon() tagged-template, ensure*Table idempotent, valeurs Number()
// converties côté JS car Postgres renvoie NUMERIC en string).

import { getSql } from "./db";

const ASSET_TYPES = ["wind", "pv", "bess", "flexible", "dsm"];
const PPA_STRUCTURES = ["fixed", "floating", "cap_floor", "pay_as_produced", "baseload"];
const SERIES_TYPES = ["forecast", "actual", "traded_da", "traded_id", "nominated_ppa"];

// TSO par pays. DE a 4 zones de réglage; les autres marchés Phase 1 n'en ont
// qu'un seul TSO national — gardé sous forme de liste pour rester extensible
// (ex: si un actif italien est un jour rattaché à une zone de marché infra-Terna).
const TSO_BY_COUNTRY = {
  DE: ["50Hertz", "Amprion", "TenneT TSO", "TransnetBW"],
  FR: ["RTE"],
  IT: ["Terna"],
  ES: ["REE"],
};

let schemaReady = false;
async function ensureSchema(sql) {
  if (schemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS assets (
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
    )
  `;
  // Idempotent: si la table existait déjà avant l'ajout du champ tso.
  await sql`ALTER TABLE assets ADD COLUMN IF NOT EXISTS tso VARCHAR(40)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_assets_country_type ON assets (country, asset_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_assets_tso ON assets (tso)`;

  await sql`
    CREATE TABLE IF NOT EXISTS ppa_contracts (
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
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_ppa_asset ON ppa_contracts (asset_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ppa_dates ON ppa_contracts (start_date, end_date)`;

  // Position physique par asset (réalisé), résolution 15-min ou horaire
  // selon la source. Alimentée manuellement ou par import (métering, SCADA).
  await sql`
    CREATE TABLE IF NOT EXISTS asset_positions (
      asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      ts              TIMESTAMPTZ NOT NULL,
      output_mw       NUMERIC(10, 3) NOT NULL,
      PRIMARY KEY (asset_id, ts)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_positions_asset_ts ON asset_positions (asset_id, ts)`;

  // Planning de dispatch BESS (charge/décharge planifiée ou réalisée).
  await sql`
    CREATE TABLE IF NOT EXISTS bess_dispatch (
      asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      ts              TIMESTAMPTZ NOT NULL,
      power_mw        NUMERIC(10, 3) NOT NULL,  -- >0 décharge (injection), <0 charge (soutirage)
      soc_mwh         NUMERIC(10, 3),           -- state of charge en fin de pas
      mode            VARCHAR(20) NOT NULL DEFAULT 'planned', -- planned | realized
      PRIMARY KEY (asset_id, ts, mode)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_bess_asset_ts ON bess_dispatch (asset_id, ts)`;

  // Fenêtres de flexibilité déclarées (DSM / assets flexibles).
  await sql`
    CREATE TABLE IF NOT EXISTS flex_availability (
      id                SERIAL PRIMARY KEY,
      asset_id          INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      start_ts          TIMESTAMPTZ NOT NULL,
      end_ts            TIMESTAMPTZ NOT NULL,
      available_mw      NUMERIC(10, 3) NOT NULL,
      activation_cost_eur_mwh NUMERIC(10, 2),
      direction         VARCHAR(10) NOT NULL DEFAULT 'down', -- down (réduction conso) | up (augmentation)
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_flex_asset_window ON flex_availability (asset_id, start_ts, end_ts)`;

  // Séries temporelles génériques par actif: forecast, actual (réalisé),
  // traded_da / traded_id (volumes vendus/achetés), nominated_ppa (volume
  // couvert par PPA). L'open position se calcule à la volée (voir
  // getOpenPosition / getPortfolioTree) plutôt que d'être stockée, pour
  // toujours refléter les dernières valeurs traded/forecast sans risque
  // d'incohérence entre une valeur stockée et ses composantes.
  await sql`
    CREATE TABLE IF NOT EXISTS asset_timeseries (
      asset_id      INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      ts            TIMESTAMPTZ NOT NULL,
      series_type   VARCHAR(20) NOT NULL,
      value_mw      NUMERIC(10, 3) NOT NULL,
      PRIMARY KEY (asset_id, ts, series_type)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_ts_asset_ts ON asset_timeseries (asset_id, ts)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ts_series_ts ON asset_timeseries (series_type, ts)`;

  schemaReady = true;
}

function toNum(v) {
  return v === null || v === undefined ? null : Number(v);
}

function mapAsset(r) {
  return {
    id: r.id,
    name: r.name,
    asset_type: r.asset_type,
    country: r.country,
    tso: r.tso,
    capacity_mw: toNum(r.capacity_mw),
    capacity_mwh: toNum(r.capacity_mwh),
    commissioning_date: r.commissioning_date,
    status: r.status,
    metadata: r.metadata,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function mapPPA(r) {
  return {
    id: r.id,
    asset_id: r.asset_id,
    counterparty: r.counterparty,
    structure: r.structure,
    strike_price_eur_mwh: toNum(r.strike_price_eur_mwh),
    cap_eur_mwh: toNum(r.cap_eur_mwh),
    floor_eur_mwh: toNum(r.floor_eur_mwh),
    volume_mw: toNum(r.volume_mw),
    start_date: r.start_date,
    end_date: r.end_date,
    country: r.country,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ---------- Assets ----------

export async function listAssets({ country, asset_type } = {}) {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT * FROM assets
    WHERE (${country || null}::varchar IS NULL OR country = ${country || null})
      AND (${asset_type || null}::varchar IS NULL OR asset_type = ${asset_type || null})
    ORDER BY id ASC
  `;
  return rows.map(mapAsset);
}

export async function getAsset(id) {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`SELECT * FROM assets WHERE id = ${id}`;
  return rows[0] ? mapAsset(rows[0]) : null;
}

export async function createAsset(data) {
  if (!data.name || !data.asset_type || !data.country || data.capacity_mw === undefined) {
    throw new Error("name, asset_type, country, capacity_mw sont requis");
  }
  if (!ASSET_TYPES.includes(data.asset_type)) {
    throw new Error(`asset_type invalide. Valeurs acceptées: ${ASSET_TYPES.join(", ")}`);
  }
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    INSERT INTO assets (name, asset_type, country, tso, capacity_mw, capacity_mwh, commissioning_date, status, metadata)
    VALUES (
      ${data.name}, ${data.asset_type}, ${data.country.toUpperCase()}, ${data.tso ?? null}, ${data.capacity_mw},
      ${data.capacity_mwh ?? null}, ${data.commissioning_date ?? null},
      ${data.status || "operational"}, ${JSON.stringify(data.metadata || {})}
    )
    RETURNING *
  `;
  return mapAsset(rows[0]);
}

export async function updateAsset(id, data) {
  const sql = getSql();
  await ensureSchema(sql);
  const existing = await getAsset(id);
  if (!existing) return null;
  if (data.asset_type && !ASSET_TYPES.includes(data.asset_type)) {
    throw new Error(`asset_type invalide. Valeurs acceptées: ${ASSET_TYPES.join(", ")}`);
  }
  const rows = await sql`
    UPDATE assets SET
      name = ${data.name ?? existing.name},
      asset_type = ${data.asset_type ?? existing.asset_type},
      country = ${(data.country ?? existing.country).toUpperCase()},
      tso = ${data.tso !== undefined ? data.tso : existing.tso},
      capacity_mw = ${data.capacity_mw ?? existing.capacity_mw},
      capacity_mwh = ${data.capacity_mwh ?? existing.capacity_mwh},
      commissioning_date = ${data.commissioning_date ?? existing.commissioning_date},
      status = ${data.status ?? existing.status},
      metadata = ${JSON.stringify(data.metadata ?? existing.metadata)},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return mapAsset(rows[0]);
}

export async function deleteAsset(id) {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`DELETE FROM assets WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

// ---------- PPA contracts ----------

export async function listPPAs({ asset_id, country, active_on } = {}) {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT * FROM ppa_contracts
    WHERE (${asset_id ?? null}::integer IS NULL OR asset_id = ${asset_id ?? null})
      AND (${country || null}::varchar IS NULL OR country = ${country || null})
      AND (${active_on || null}::date IS NULL OR (start_date <= ${active_on || null} AND end_date >= ${active_on || null}))
    ORDER BY start_date DESC
  `;
  return rows.map(mapPPA);
}

export async function createPPA(data) {
  const required = ["counterparty", "structure", "start_date", "end_date", "country"];
  for (const f of required) {
    if (!data[f]) throw new Error(`${f} est requis`);
  }
  if (!PPA_STRUCTURES.includes(data.structure)) {
    throw new Error(`structure invalide. Valeurs acceptées: ${PPA_STRUCTURES.join(", ")}`);
  }
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    INSERT INTO ppa_contracts (
      asset_id, counterparty, structure, strike_price_eur_mwh, cap_eur_mwh, floor_eur_mwh,
      volume_mw, start_date, end_date, country, notes
    ) VALUES (
      ${data.asset_id ?? null}, ${data.counterparty}, ${data.structure},
      ${data.strike_price_eur_mwh ?? null}, ${data.cap_eur_mwh ?? null}, ${data.floor_eur_mwh ?? null},
      ${data.volume_mw ?? null}, ${data.start_date}, ${data.end_date},
      ${data.country.toUpperCase()}, ${data.notes ?? null}
    )
    RETURNING *
  `;
  return mapPPA(rows[0]);
}

export async function updatePPA(id, data) {
  const sql = getSql();
  await ensureSchema(sql);
  const rows0 = await sql`SELECT * FROM ppa_contracts WHERE id = ${id}`;
  if (!rows0[0]) return null;
  const existing = mapPPA(rows0[0]);
  if (data.structure && !PPA_STRUCTURES.includes(data.structure)) {
    throw new Error(`structure invalide. Valeurs acceptées: ${PPA_STRUCTURES.join(", ")}`);
  }
  const rows = await sql`
    UPDATE ppa_contracts SET
      asset_id = ${data.asset_id ?? existing.asset_id},
      counterparty = ${data.counterparty ?? existing.counterparty},
      structure = ${data.structure ?? existing.structure},
      strike_price_eur_mwh = ${data.strike_price_eur_mwh ?? existing.strike_price_eur_mwh},
      cap_eur_mwh = ${data.cap_eur_mwh ?? existing.cap_eur_mwh},
      floor_eur_mwh = ${data.floor_eur_mwh ?? existing.floor_eur_mwh},
      volume_mw = ${data.volume_mw ?? existing.volume_mw},
      start_date = ${data.start_date ?? existing.start_date},
      end_date = ${data.end_date ?? existing.end_date},
      country = ${(data.country ?? existing.country).toUpperCase()},
      notes = ${data.notes ?? existing.notes},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return mapPPA(rows[0]);
}

export async function deletePPA(id) {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`DELETE FROM ppa_contracts WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

// ---------- P&L ----------
// Calcule, pour un asset sur une période, le revenu marché (position x prix
// day-ahead), le revenu PPA équivalent selon la structure du contrat actif,
// et l'écart (PPA - marché) = valeur de la couverture.
export async function computeAssetPnl(assetId, from, to) {
  const sql = getSql();
  await ensureSchema(sql);

  const asset = await getAsset(assetId);
  if (!asset) throw new Error("Asset introuvable");

  const rows = await sql`
    SELECT
      p.ts,
      p.output_mw,
      mp.price_eur_mwh
    FROM asset_positions p
    LEFT JOIN market_prices mp
      ON mp.country = ${asset.country} AND mp.ts = p.ts
    WHERE p.asset_id = ${assetId} AND p.ts >= ${from} AND p.ts < ${to}
    ORDER BY p.ts ASC
  `;

  const ppas = await sql`
    SELECT * FROM ppa_contracts
    WHERE asset_id = ${assetId}
      AND start_date <= ${to}::date AND end_date >= ${from}::date
    ORDER BY start_date ASC
  `;

  let marketRevenue = 0;
  let ppaRevenue = 0;
  let totalMwh = 0;
  const points = [];

  // Résolution 15-min -> 0.25h par point (hypothèse cohérente avec le reste du schéma)
  const HOURS_PER_POINT = 0.25;

  for (const r of rows) {
    const mw = toNum(r.output_mw) || 0;
    const price = toNum(r.price_eur_mwh);
    const mwh = mw * HOURS_PER_POINT;
    totalMwh += mwh;

    const marketValue = price !== null ? mwh * price : 0;
    marketRevenue += marketValue;

    const activePpa = ppas
      .map(mapPPA)
      .find((c) => c.start_date <= r.ts && c.end_date >= r.ts);

    let ppaPrice = price;
    if (activePpa) {
      if (activePpa.structure === "fixed" || activePpa.structure === "baseload" || activePpa.structure === "pay_as_produced") {
        ppaPrice = activePpa.strike_price_eur_mwh ?? price;
      } else if (activePpa.structure === "cap_floor" && price !== null) {
        ppaPrice = Math.min(Math.max(price, activePpa.floor_eur_mwh ?? -Infinity), activePpa.cap_eur_mwh ?? Infinity);
      } else if (activePpa.structure === "floating") {
        ppaPrice = price;
      }
    }
    const ppaValue = ppaPrice !== null ? mwh * ppaPrice : 0;
    ppaRevenue += ppaValue;

    points.push({ ts: r.ts, output_mw: mw, market_price_eur_mwh: price, ppa_price_eur_mwh: ppaPrice });
  }

  return {
    asset_id: assetId,
    asset_name: asset.name,
    from,
    to,
    total_mwh: Number(totalMwh.toFixed(2)),
    market_revenue_eur: Number(marketRevenue.toFixed(2)),
    ppa_revenue_eur: Number(ppaRevenue.toFixed(2)),
    hedge_value_eur: Number((ppaRevenue - marketRevenue).toFixed(2)),
    active_ppas: ppas.map(mapPPA).map((p) => ({ id: p.id, counterparty: p.counterparty, structure: p.structure })),
    points,
  };
}

export const ASSET_TYPES_LIST = ASSET_TYPES;
export const PPA_STRUCTURES_LIST = PPA_STRUCTURES;
export const TSO_BY_COUNTRY_MAP = TSO_BY_COUNTRY;
export const SERIES_TYPES_LIST = SERIES_TYPES;
// ---------- Node-based multi-resolution timeseries ----------
// Un "node" identifie un niveau de la hiérarchie Portfolio > TSO > Technologie
// > Parc. Clés supportées:
//   "portfolio"                      -> tout le portefeuille
//   "portfolio|{country}"            -> portefeuille filtré par pays
//   "tso|{country}|{tso}"            -> tous les actifs d'un TSO
//   "tech|{country}|{tso}|{type}"    -> une technologie au sein d'un TSO
//   "asset|{id}"                     -> un actif (parc) individuel
export function parseNodeKey(key) {
  const parts = key.split("|");
  const kind = parts[0];
  if (kind === "portfolio") return { kind, country: parts[1] || null, label: parts[1] ? `Portfolio (${parts[1]})` : "Portfolio" };
  if (kind === "tso") return { kind, country: parts[1], tso: parts[2], label: `${parts[2]} (${parts[1]})` };
  if (kind === "tech") return { kind, country: parts[1], tso: parts[2], asset_type: parts[3], label: `${parts[3]} @ ${parts[2]} (${parts[1]})` };
  if (kind === "asset") return { kind, asset_id: Number(parts[1]), label: null };
  throw new Error(`Node key invalide: ${key}`);
}

async function resolveNodeAssets(sql, node) {
  if (node.kind === "portfolio") {
    const rows = await sql`
      SELECT * FROM assets WHERE (${node.country || null}::varchar IS NULL OR country = ${node.country || null})
    `;
    return rows.map(mapAsset);
  }
  if (node.kind === "tso") {
    const rows = node.tso === "Unassigned"
      ? await sql`SELECT * FROM assets WHERE country = ${node.country} AND tso IS NULL`
      : await sql`SELECT * FROM assets WHERE country = ${node.country} AND tso = ${node.tso}`;
    return rows.map(mapAsset);
  }
  if (node.kind === "tech") {
    const rows = node.tso === "Unassigned"
      ? await sql`SELECT * FROM assets WHERE country = ${node.country} AND tso IS NULL AND asset_type = ${node.asset_type}`
      : await sql`SELECT * FROM assets WHERE country = ${node.country} AND tso = ${node.tso} AND asset_type = ${node.asset_type}`;
    return rows.map(mapAsset);
  }
  if (node.kind === "asset") {
    const a = await getAsset(node.asset_id);
    return a ? [a] : [];
  }
  return [];
}

// Résolutions supportées, de l'infra-horaire au pluriannuel. `kind` détermine
// l'unité affichée: "power" (MW, moyenne du pas) pour <=1h, "energy" (MWh,
// volume cumulé sur le pas) au-delà — c'est la convention correcte en trading
// d'énergie (on ne "moyenne" pas un volume mensuel, on le somme).
export const RESOLUTIONS = {
  "15m": { label: "15 min", unitMs: 15 * 60 * 1000, kind: "power", unit: "MW" },
  "30m": { label: "30 min", unitMs: 30 * 60 * 1000, kind: "power", unit: "MW" },
  "1h": { label: "1 heure", unitMs: 60 * 60 * 1000, kind: "power", unit: "MW" },
  "4h": { label: "4 heures", unitMs: 4 * 60 * 60 * 1000, kind: "energy", unit: "MWh" },
  "1D": { label: "1 jour", calendar: "day", kind: "energy", unit: "MWh" },
  "1W": { label: "1 semaine", calendar: "week", kind: "energy", unit: "MWh" },
  "1M": { label: "1 mois", calendar: "month", kind: "energy", unit: "MWh" },
  "1Q": { label: "1 trimestre", calendar: "quarter", kind: "energy", unit: "MWh" },
  "1Y": { label: "1 an", calendar: "year", kind: "energy", unit: "MWh" },
};

function bucketStart(date, resKey) {
  const res = RESOLUTIONS[resKey];
  if (res.unitMs) return new Date(Math.floor(date.getTime() / res.unitMs) * res.unitMs);
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  if (res.calendar === "day") return new Date(Date.UTC(y, m, d));
  if (res.calendar === "week") {
    const dow = (date.getUTCDay() + 6) % 7; // lundi = 0
    return new Date(Date.UTC(y, m, d - dow));
  }
  if (res.calendar === "month") return new Date(Date.UTC(y, m, 1));
  if (res.calendar === "quarter") return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
  if (res.calendar === "year") return new Date(Date.UTC(y, 0, 1));
  return date;
}

const DERIVED_DEPENDENCIES = ["forecast", "actual", "traded_da", "traded_id", "nominated_ppa"];

export async function getNodeTimeseries({ nodeKeys, seriesTypes, resolution, from, to }) {
  if (!Array.isArray(nodeKeys) || nodeKeys.length === 0) throw new Error("nodeKeys requis");
  if (!Array.isArray(seriesTypes) || seriesTypes.length === 0) throw new Error("seriesTypes requis");
  if (!RESOLUTIONS[resolution]) throw new Error(`resolution invalide. Valeurs: ${Object.keys(RESOLUTIONS).join(", ")}`);
  if (!from || !to) throw new Error("from et to sont requis");

  const sql = getSql();
  await ensureSchema(sql);
  const res = RESOLUTIONS[resolution];
  const needsOpenPosition = seriesTypes.includes("open_position");
  const fetchTypes = needsOpenPosition
    ? [...new Set([...seriesTypes.filter((s) => s !== "open_position"), ...DERIVED_DEPENDENCIES])]
    : seriesTypes;

  const results = [];
  for (const key of nodeKeys) {
    const node = parseNodeKey(key);
    const nodeAssets = await resolveNodeAssets(sql, node);
    const label = node.label || nodeAssets[0]?.name || key;
    const assetIds = nodeAssets.map((a) => a.id);
    if (assetIds.length === 0) {
      for (const st of seriesTypes) results.push({ node_key: key, label, series_type: st, unit: res.unit, points: [] });
      continue;
    }

    const rows = await sql`
      SELECT asset_id, ts, series_type, value_mw FROM asset_timeseries
      WHERE asset_id = ANY(${assetIds}::integer[]) AND ts >= ${from} AND ts < ${to}
        AND series_type = ANY(${fetchTypes}::varchar[])
      ORDER BY ts ASC
    `;

    // Étape 1: somme entre actifs, par timestamp, par série -> série "node-level".
    const byTsSeries = new Map(); // tsIso -> { series_type: sumMW }
    const tsList = [];
    for (const r of rows) {
      const tsIso = r.ts.toISOString ? r.ts.toISOString() : new Date(r.ts).toISOString();
      if (!byTsSeries.has(tsIso)) { byTsSeries.set(tsIso, {}); tsList.push(tsIso); }
      const bucket = byTsSeries.get(tsIso);
      bucket[r.series_type] = (bucket[r.series_type] || 0) + toNum(r.value_mw);
    }
    const sortedTs = [...new Set(tsList)].sort();
    const stepHours = sortedTs.length > 1 ? (new Date(sortedTs[1]) - new Date(sortedTs[0])) / 3_600_000 : 1;

    // Étape 2: open_position par ts si demandée.
    if (needsOpenPosition) {
      for (const tsIso of sortedTs) {
        const b = byTsSeries.get(tsIso);
        const base = b.actual !== undefined ? b.actual : (b.forecast || 0);
        const committed = (b.traded_da || 0) + (b.traded_id || 0) + (b.nominated_ppa || 0);
        b.open_position = base - committed;
      }
    }

    // Étape 3: bucketing selon la résolution choisie, agrégation power(moyenne)/energy(somme*h).
    for (const seriesType of seriesTypes) {
      const buckets = new Map(); // bucketIso -> { sum, count }
      for (const tsIso of sortedTs) {
        const v = byTsSeries.get(tsIso)[seriesType];
        if (v === undefined) continue;
        const bIso = bucketStart(new Date(tsIso), resolution).toISOString();
        if (!buckets.has(bIso)) buckets.set(bIso, { sum: 0, count: 0 });
        const b = buckets.get(bIso);
        b.sum += res.kind === "energy" ? v * stepHours : v;
        b.count += 1;
      }
      const points = [...buckets.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([bIso, b]) => ({
          t: bIso,
          value: Number((res.kind === "energy" ? b.sum : b.sum / b.count).toFixed(3)),
        }));
      results.push({ node_key: key, label, series_type: seriesType, unit: res.unit, points });
    }
  }

  return { resolution, unit: res.unit, from, to, series: results };
}

// ---------- Timeseries: forecast / actual / traded_da / traded_id / nominated_ppa ----------

export async function upsertTimeseries(points) {
  // points: [{ asset_id, ts, series_type, value_mw }, ...]
  if (!Array.isArray(points) || points.length === 0) throw new Error("points doit être un tableau non vide");
  for (const p of points) {
    if (!p.asset_id || !p.ts || !SERIES_TYPES.includes(p.series_type) || p.value_mw === undefined) {
      throw new Error(`Point invalide: ${JSON.stringify(p)}. series_type doit être l'un de: ${SERIES_TYPES.join(", ")}`);
    }
  }
  const sql = getSql();
  await ensureSchema(sql);
  // Insertion par lot via unnest pour rester efficace même avec des centaines de points.
  const assetIds = points.map((p) => p.asset_id);
  const tss = points.map((p) => p.ts);
  const types = points.map((p) => p.series_type);
  const values = points.map((p) => p.value_mw);
  await sql`
    INSERT INTO asset_timeseries (asset_id, ts, series_type, value_mw)
    SELECT * FROM unnest(
      ${assetIds}::integer[], ${tss}::timestamptz[], ${types}::varchar[], ${values}::numeric[]
    )
    ON CONFLICT (asset_id, ts, series_type) DO UPDATE SET value_mw = EXCLUDED.value_mw
  `;
  return { inserted: points.length };
}

export async function getAssetTimeseries(assetId, from, to) {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT ts, series_type, value_mw FROM asset_timeseries
    WHERE asset_id = ${assetId} AND ts >= ${from} AND ts < ${to}
    ORDER BY ts ASC
  `;
  // Pivot en une ligne par ts, une colonne par série, + open_position calculée.
  const byTs = new Map();
  for (const r of rows) {
    if (!byTs.has(r.ts)) byTs.set(r.ts, { ts: r.ts });
    byTs.get(r.ts)[r.series_type] = toNum(r.value_mw);
  }
  const points = [...byTs.values()].map((p) => {
    const base = p.actual !== undefined ? p.actual : (p.forecast ?? 0);
    const committed = (p.traded_da || 0) + (p.traded_id || 0) + (p.nominated_ppa || 0);
    return { ...p, open_position: Number((base - committed).toFixed(3)) };
  });
  return points;
}

// ---------- Tree: Portfolio > TSO > Technology > Assets, avec métriques timeseries ----------
// Agrège la capacité (MW) ET, si `date` est fourni, les volumes journaliers
// (MWh, résolution détectée automatiquement à partir des points stockés) de
// forecast / actual / traded / nominated_ppa / open_position à chaque noeud.
export async function getPortfolioTree({ country, date } = {}) {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT * FROM assets
    WHERE (${country || null}::varchar IS NULL OR country = ${country || null})
    ORDER BY country, tso NULLS LAST, asset_type, name
  `;
  const assets = rows.map(mapAsset);

  let metricsByAsset = new Map();
  if (date) {
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;
    const tsRows = await sql`
      SELECT asset_id, ts, series_type, value_mw FROM asset_timeseries
      WHERE ts >= ${dayStart} AND ts <= ${dayEnd}
        AND asset_id IN (SELECT id FROM assets WHERE ${country || null}::varchar IS NULL OR country = ${country || null})
      ORDER BY asset_id, ts
    `;
    // Regroupe par asset, calcule le pas de temps (heures) pour convertir MW -> MWh, puis somme.
    const byAsset = new Map();
    for (const r of tsRows) {
      if (!byAsset.has(r.asset_id)) byAsset.set(r.asset_id, []);
      byAsset.get(r.asset_id).push({ ts: r.ts, series_type: r.series_type, value_mw: toNum(r.value_mw) });
    }
    for (const [assetId, pts] of byAsset) {
      const tsSet = [...new Set(pts.map((p) => p.ts.getTime ? p.ts.getTime() : new Date(p.ts).getTime()))].sort((a, b) => a - b);
      const stepHours = tsSet.length > 1 ? (tsSet[1] - tsSet[0]) / 3_600_000 : 1;
      const sums = { forecast: 0, actual: 0, traded_da: 0, traded_id: 0, nominated_ppa: 0 };
      for (const p of pts) sums[p.series_type] = (sums[p.series_type] || 0) + p.value_mw * stepHours;
      const base = sums.actual || sums.forecast || 0;
      const committed = sums.traded_da + sums.traded_id + sums.nominated_ppa;
      metricsByAsset.set(assetId, { ...sums, open_position: base - committed });
    }
  }

  function emptyMetrics() {
    return { forecast: 0, actual: 0, traded_da: 0, traded_id: 0, nominated_ppa: 0, open_position: 0 };
  }
  function addMetrics(a, b) {
    return {
      forecast: a.forecast + b.forecast,
      actual: a.actual + b.actual,
      traded_da: a.traded_da + b.traded_da,
      traded_id: a.traded_id + b.traded_id,
      nominated_ppa: a.nominated_ppa + b.nominated_ppa,
      open_position: a.open_position + b.open_position,
    };
  }
  function roundMetrics(m) {
    const r = {};
    for (const k of Object.keys(m)) r[k] = Number(m[k].toFixed(2));
    return r;
  }

  const tsoMap = new Map();
  for (const a of assets) {
    const m = metricsByAsset.get(a.id) || emptyMetrics();
    const tsoKey = `${a.country}::${a.tso || "Unassigned"}`;
    if (!tsoMap.has(tsoKey)) {
      tsoMap.set(tsoKey, { country: a.country, tso: a.tso || "Unassigned", capacity_mw: 0, metrics: emptyMetrics(), technologies: new Map() });
    }
    const tsoNode = tsoMap.get(tsoKey);
    tsoNode.capacity_mw += a.capacity_mw || 0;
    tsoNode.metrics = addMetrics(tsoNode.metrics, m);

    if (!tsoNode.technologies.has(a.asset_type)) {
      tsoNode.technologies.set(a.asset_type, { asset_type: a.asset_type, capacity_mw: 0, metrics: emptyMetrics(), assets: [] });
    }
    const techNode = tsoNode.technologies.get(a.asset_type);
    techNode.capacity_mw += a.capacity_mw || 0;
    techNode.metrics = addMetrics(techNode.metrics, m);
    techNode.assets.push({ ...a, metrics: roundMetrics(m) });
  }

  const tsoNodes = [...tsoMap.values()]
    .map((t) => ({
      ...t,
      capacity_mw: Number(t.capacity_mw.toFixed(3)),
      metrics: roundMetrics(t.metrics),
      technologies: [...t.technologies.values()].map((tech) => ({
        ...tech,
        capacity_mw: Number(tech.capacity_mw.toFixed(3)),
        metrics: roundMetrics(tech.metrics),
      })),
    }))
    .sort((a, b) => (a.country === b.country ? a.tso.localeCompare(b.tso) : a.country.localeCompare(b.country)));

  const totalCapacity = Number(assets.reduce((s, a) => s + (a.capacity_mw || 0), 0).toFixed(3));
  const portfolioMetrics = roundMetrics(tsoNodes.reduce((acc, t) => addMetrics(acc, t.metrics), emptyMetrics()));

  return {
    portfolio: {
      capacity_mw: totalCapacity,
      asset_count: assets.length,
      metrics: portfolioMetrics,
      date: date || null,
      tso_nodes: tsoNodes,
    },
  };
}
