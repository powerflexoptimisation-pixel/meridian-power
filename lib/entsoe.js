// lib/entsoe.js
// Port JS du collecteur ENTSO-E (server-side uniquement — jamais importé côté client).
// Le token ENTSOE_TOKEN doit être défini en variable d'environnement (jamais dans le code).

import { XMLParser } from "fast-xml-parser";

const BASE_URL = "https://web-api.tp.entsoe.eu/api";

export const DOMAINS = {
  DE: "10Y1001A1001A82H", // DE-LU
  FR: "10YFR-RTE------C",
  IT: "10Y1001A1001A73I", // IT-North (référence PUN)
  ES: "10YES-REE------0",
};

const PSR_TYPES = {
  B01: "Biomass", B02: "Fossil Brown coal/Lignite", B03: "Fossil Coal-derived gas",
  B04: "Fossil Gas", B05: "Fossil Hard coal", B06: "Fossil Oil",
  B07: "Fossil Oil shale", B08: "Fossil Peat", B09: "Geothermal",
  B10: "Hydro Pumped Storage", B11: "Hydro Run-of-river", B12: "Hydro Water Reservoir",
  B13: "Marine", B14: "Nuclear", B15: "Other renewable", B16: "Solar",
  B17: "Waste", B18: "Wind Offshore", B19: "Wind Onshore", B20: "Other",
  B25: "Energy storage",
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function stepMinutes(res) {
  if (res === "PT15M") return 15;
  if (res === "PT30M") return 30;
  if (res === "PT60M") return 60;
  throw new Error(`Résolution non gérée: ${res}`);
}

function toArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

async function fetchEntsoe(params) {
  const token = process.env.ENTSOE_TOKEN;
  if (!token) throw new Error("ENTSOE_TOKEN manquant dans les variables d'environnement");
  const qs = new URLSearchParams({ ...params, securityToken: token });
  const res = await fetch(`${BASE_URL}?${qs.toString()}`, {
    // cache côté Next: on revalide au plus toutes les 15 min pour ne pas
    // spammer l'API (limite ENTSO-E: ~400 requêtes / min / token)
    next: { revalidate: 900 },
  });
  const text = await res.text();
  return text;
}

function periodStr(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

export async function fetchDayAheadPrices(countryCode, periodStart, periodEnd) {
  const domain = DOMAINS[countryCode];
  const xml = await fetchEntsoe({
    documentType: "A44",
    in_Domain: domain,
    out_Domain: domain,
    periodStart: periodStr(periodStart),
    periodEnd: periodStr(periodEnd),
  });
  if (xml.includes("Acknowledgement_MarketDocument")) {
    return { points: [], warning: "Pas de données disponibles pour cette période" };
  }
  const doc = parser.parse(xml);
  const root = doc.Publication_MarketDocument;
  const seriesList = toArray(root?.TimeSeries);
  const points = [];
  for (const ts of seriesList) {
    // DE-LU publie 2 séquences parallèles pour la même période (15-min MTU).
    // On ne garde que la séquence 1 (résultats primaires, prix négatifs cohérents).
    const seq = ts["classificationSequence_AttributeInstanceComponent.position"];
    if (seq !== undefined && String(seq) !== "1") continue;
    const periods = toArray(ts.Period);
    for (const period of periods) {
      if (!period || !period.timeInterval) continue;
      const start = new Date(period.timeInterval.start);
      const step = stepMinutes(period.resolution);
      const pointList = toArray(period.Point);
      for (const p of pointList) {
        const pos = Number(p.position);
        const price = Number(p["price.amount"]);
        const t = new Date(start.getTime() + (pos - 1) * step * 60000);
        points.push({ timestamp: t.toISOString(), price_eur_mwh: price });
      }
    }
  }
  const dedup = new Map(points.map((p) => [p.timestamp, p]));
  return { points: [...dedup.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) };
}

export async function fetchGenerationMix(countryCode, periodStart, periodEnd) {
  const domain = DOMAINS[countryCode];
  const xml = await fetchEntsoe({
    documentType: "A75",
    processType: "A16",
    in_Domain: domain,
    periodStart: periodStr(periodStart),
    periodEnd: periodStr(periodEnd),
  });
  if (xml.includes("Acknowledgement_MarketDocument")) {
    return { points: [], warning: "Pas de données disponibles pour cette période" };
  }
  const doc = parser.parse(xml);
  const root = doc.GL_MarketDocument;
  const seriesList = toArray(root?.TimeSeries);
  const buckets = new Map();
  for (const ts of seriesList) {
    const psrCode = ts?.MktPSRType?.psrType;
    const label = PSR_TYPES[psrCode] || psrCode || "Unknown";
    const periods = toArray(ts.Period);
    for (const period of periods) {
      if (!period || !period.timeInterval) continue;
      const start = new Date(period.timeInterval.start);
      const step = stepMinutes(period.resolution);
      const pointList = toArray(period.Point);
      for (const p of pointList) {
        const pos = Number(p.position);
        if (p.quantity === undefined) continue;
        const qty = Number(p.quantity);
        const t = new Date(start.getTime() + (pos - 1) * step * 60000).toISOString();
        const bucket = buckets.get(t) || { timestamp: t };
        bucket[label] = (bucket[label] || 0) + qty;
        buckets.set(t, bucket);
      }
    }
  }
  return { points: [...buckets.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) };
}

// Récupère prix + génération pour un pays sur la dernière journée calendaire complète disponible
export async function collectCountry(countryCode) {
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const periodStart = new Date(periodEnd.getTime() - 24 * 3600 * 1000);
  const [prices, generation] = await Promise.all([
    fetchDayAheadPrices(countryCode, periodStart, periodEnd),
    fetchGenerationMix(countryCode, periodStart, periodEnd),
  ]);
  return { country: countryCode, prices: prices.points, generation: generation.points, warnings: [prices.warning, generation.warning].filter(Boolean) };
}
