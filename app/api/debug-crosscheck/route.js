import { NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sql = getSql();
  // ENTSO-E actual generation (Wind Onshore/Offshore/Solar) vs Hochrechnung
  // netztransparenz.de (indépendant), même fenêtre récente.
  const entsoe = await sql`
    SELECT ts, fuel_type, quantity_mw FROM market_generation
    WHERE country = 'DE' AND fuel_type IN ('Wind Onshore','Wind Offshore','Solar')
      AND ts >= now() - interval '3 days' AND ts < now() - interval '1 day'
    ORDER BY ts
  `;
  const hochrechnung = await sql`
    SELECT ts, product, tso, value_mw FROM de_hochrechnung
    WHERE ts >= now() - interval '3 days' AND ts < now() - interval '1 day'
    ORDER BY ts
  `;
  // Agréger Hochrechnung (par TSO) en total DE par produit/heure
  const hochByTsProduct = {};
  for (const r of hochrechnung) {
    const key = `${r.ts.toISOString()}|${r.product}`;
    hochByTsProduct[key] = (hochByTsProduct[key] || 0) + Number(r.value_mw);
  }
  // Comparer aux mêmes horodatages ENTSO-E
  const rows = [];
  for (const r of entsoe) {
    const productKey = r.fuel_type === "Solar" ? "Solar" : "Wind";
    const key = `${r.ts.toISOString()}|${productKey}`;
    if (hochByTsProduct[key] !== undefined) {
      rows.push({ ts: r.ts.toISOString(), fuel: r.fuel_type, entsoe_mw: Number(r.quantity_mw), hochrechnung_mw: hochByTsProduct[key] });
    }
  }
  return NextResponse.json({ entsoe_rows: entsoe.length, hochrechnung_rows: hochrechnung.length, matched: rows.length, sample: rows.filter((_, i) => i % 20 === 0).slice(0, 15) });
}
