// lib/db.js
import { neon } from "@neondatabase/serverless";

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL manquant — connecte l'intégration Neon dans Vercel (Storage → Neon)");
  }
  return neon(process.env.DATABASE_URL);
}

let loadTableReady = false;
async function ensureLoadTable(sql) {
  if (loadTableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS market_load (
      country VARCHAR(2) NOT NULL,
      ts TIMESTAMPTZ NOT NULL,
      load_mw NUMERIC(10, 2) NOT NULL,
      PRIMARY KEY (country, ts)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_load_country_ts ON market_load (country, ts)`;
  loadTableReady = true;
}

export async function upsertLoad(country, points) {
  if (!points || points.length === 0) return 0;
  const sql = getSql();
  await ensureLoadTable(sql);
  const countries = points.map(() => country);
  const timestamps = points.map((p) => p.timestamp);
  const loads = points.map((p) => p.load_mw);
  await sql`
    INSERT INTO market_load (country, ts, load_mw)
    SELECT * FROM unnest(${countries}::varchar[], ${timestamps}::timestamptz[], ${loads}::numeric[])
    ON CONFLICT (country, ts) DO UPDATE SET load_mw = EXCLUDED.load_mw
  `;
  return points.length;
}

export async function getLoadHistory(country, from, to) {
  const sql = getSql();
  await ensureLoadTable(sql);
  const rows = await sql`
    SELECT ts, load_mw
    FROM market_load
    WHERE country = ${country} AND ts >= ${from} AND ts < ${to}
    ORDER BY ts ASC
  `;
  return rows.map((r) => ({ timestamp: typeof r.ts === "string" ? r.ts : r.ts.toISOString(), load_mw: Number(r.load_mw) }));
}

export async function upsertPrices(country, points) {
  if (!points || points.length === 0) return 0;
  const sql = getSql();
  const countries = points.map(() => country);
  const timestamps = points.map((p) => p.timestamp);
  const prices = points.map((p) => p.price_eur_mwh);
  await sql`
    INSERT INTO market_prices (country, ts, price_eur_mwh)
    SELECT * FROM unnest(${countries}::varchar[], ${timestamps}::timestamptz[], ${prices}::numeric[])
    ON CONFLICT (country, ts) DO UPDATE SET price_eur_mwh = EXCLUDED.price_eur_mwh
  `;
  return points.length;
}

export async function upsertGeneration(country, points) {
  if (!points || points.length === 0) return 0;
  const sql = getSql();
  const timestamps = [];
  const fuelTypes = [];
  const quantities = [];
  for (const row of points) {
    const { timestamp, ...fuels } = row;
    for (const [fuelType, qty] of Object.entries(fuels)) {
      timestamps.push(timestamp);
      fuelTypes.push(fuelType);
      quantities.push(qty);
    }
  }
  if (timestamps.length === 0) return 0;
  const countries = timestamps.map(() => country);
  await sql`
    INSERT INTO market_generation (country, ts, fuel_type, quantity_mw)
    SELECT * FROM unnest(${countries}::varchar[], ${timestamps}::timestamptz[], ${fuelTypes}::varchar[], ${quantities}::numeric[])
    ON CONFLICT (country, ts, fuel_type) DO UPDATE SET quantity_mw = EXCLUDED.quantity_mw
  `;
  return timestamps.length;
}

export async function logCollection(country, pricePoints, genPoints, warnings) {
  const sql = getSql();
  await sql`
    INSERT INTO collection_log (country, price_points, gen_points, warnings)
    VALUES (${country}, ${pricePoints}, ${genPoints}, ${warnings && warnings.length ? warnings.join("; ") : null})
  `;
}

export async function getPriceHistory(country, from, to) {
  const sql = getSql();
  const rows = await sql`
    SELECT ts, price_eur_mwh
    FROM market_prices
    WHERE country = ${country} AND ts >= ${from} AND ts < ${to}
    ORDER BY ts ASC
  `;
  return rows.map((r) => ({ timestamp: r.ts, price_eur_mwh: Number(r.price_eur_mwh) }));
}

export async function getDailyPriceStats(country, from, to) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      date_trunc('day', ts AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin' AS day,
      AVG(price_eur_mwh) AS avg_price,
      MIN(price_eur_mwh) AS min_price,
      MAX(price_eur_mwh) AS max_price
    FROM market_prices
    WHERE country = ${country} AND ts >= ${from} AND ts < ${to}
    GROUP BY day
    ORDER BY day ASC
  `;
  return rows.map((r) => ({
    day: r.day,
    avg: Number(r.avg_price),
    min: Number(r.min_price),
    max: Number(r.max_price),
  }));
}

// Agrégation générique par résolution ('day' | 'hour'), utilisée par /api/history
// et /api/export. 'day' est aligné sur la journée de marché Europe/Berlin ;
// 'hour' bucket par heure UTC (une heure = le même instant partout).
export async function getPriceStatsBucketed(country, from, to, resolution = "day") {
  const sql = getSql();
  if (resolution === "hour") {
    const rows = await sql`
      SELECT
        date_trunc('hour', ts) AS bucket,
        AVG(price_eur_mwh) AS avg_price,
        MIN(price_eur_mwh) AS min_price,
        MAX(price_eur_mwh) AS max_price
      FROM market_prices
      WHERE country = ${country} AND ts >= ${from} AND ts < ${to}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    return rows.map((r) => ({ bucket: r.bucket, avg: Number(r.avg_price), min: Number(r.min_price), max: Number(r.max_price) }));
  }
  const rows = await sql`
    SELECT
      date_trunc('day', ts AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin' AS bucket,
      AVG(price_eur_mwh) AS avg_price,
      MIN(price_eur_mwh) AS min_price,
      MAX(price_eur_mwh) AS max_price
    FROM market_prices
    WHERE country = ${country} AND ts >= ${from} AND ts < ${to}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;
  return rows.map((r) => ({ bucket: r.bucket, avg: Number(r.avg_price), min: Number(r.min_price), max: Number(r.max_price) }));
}

export async function getGenerationHistory(country, from, to) {
  const sql = getSql();
  const rows = await sql`
    SELECT ts, fuel_type, quantity_mw
    FROM market_generation
    WHERE country = ${country} AND ts >= ${from} AND ts < ${to}
    ORDER BY ts ASC
  `;
  const byTs = new Map();
  for (const r of rows) {
    const key = typeof r.ts === "string" ? r.ts : r.ts.toISOString();
    const bucket = byTs.get(key) || { timestamp: key };
    bucket[r.fuel_type] = Number(r.quantity_mw);
    byTs.set(key, bucket);
  }
  return [...byTs.values()];
}

export async function getDataCoverage(country) {
  const sql = getSql();
  const rows = await sql`
    SELECT MIN(ts) AS earliest, MAX(ts) AS latest, COUNT(*) AS n
    FROM market_prices
    WHERE country = ${country}
  `;
  return rows[0];
}
