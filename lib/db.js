// lib/db.js
// Couche d'accès à la base Postgres (Neon, via l'intégration Vercel Marketplace).
// DATABASE_URL est injectée automatiquement par Vercel une fois l'intégration
// Neon connectée au projet (Storage → Neon → Connect Project).
// Driver: @neondatabase/serverless (recommandé par Vercel depuis la dépréciation
// de @vercel/postgres — connexion HTTP, compatible edge/serverless).

import { neon } from "@neondatabase/serverless";

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL manquant — connecte l'intégration Neon dans Vercel (Storage → Neon)");
  }
  return neon(process.env.DATABASE_URL);
}

export async function upsertPrices(country, points) {
  if (!points || points.length === 0) return 0;
  const sql = getSql();
  let count = 0;
  for (const p of points) {
    await sql`
      INSERT INTO market_prices (country, ts, price_eur_mwh)
      VALUES (${country}, ${p.timestamp}, ${p.price_eur_mwh})
      ON CONFLICT (country, ts) DO UPDATE SET price_eur_mwh = EXCLUDED.price_eur_mwh
    `;
    count++;
  }
  return count;
}

export async function upsertGeneration(country, points) {
  if (!points || points.length === 0) return 0;
  const sql = getSql();
  let count = 0;
  for (const row of points) {
    const { timestamp, ...fuels } = row;
    for (const [fuelType, qty] of Object.entries(fuels)) {
      await sql`
        INSERT INTO market_generation (country, ts, fuel_type, quantity_mw)
        VALUES (${country}, ${timestamp}, ${fuelType}, ${qty})
        ON CONFLICT (country, ts, fuel_type) DO UPDATE SET quantity_mw = EXCLUDED.quantity_mw
      `;
      count++;
    }
  }
  return count;
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
      date_trunc('day', ts) AS day,
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
