// lib/mastr.js
// Intégration Marktstammdatenregister (MaStR) — registre officiel de la
// Bundesnetzagentur, position GPS exacte + puissance de chaque éolienne
// allemande. Endpoint JSON public (bundesAPI/marktstammdaten-api), sans
// inscription requise. Remplace la pondération par capacité régionale
// (8 Länder, approximative) par une vraie grille pondérée par position
// réelle des parcs.
//
// IMPORTANT — portée volontairement limitée à l'éolien: le solaire compte
// ~5,7 millions d'unités enregistrées (vs ~32 000 pour l'éolien) — même à
// 5000 lignes/page, ce serait ~1140 pages, hors de portée d'une collecte
// dans les contraintes Vercel (maxDuration 60s). Le solaire reste donc sur
// la pondération par capacité régionale (lib/weather.js, WEATHER_POINTS).

const BASE_URL = "https://www.marktstammdatenregister.de/MaStR/Einheit/EinheitJson/GetErweiterteOeffentlicheEinheitStromerzeugung";
const ENERGIETRAEGER_WIND = "2497";
const BETRIEBS_STATUS_IN_BETRIEB = "35";

// Récupère UNE page (~20s pour 5000 lignes — le total ~32 000 lignes ne
// tient pas dans les 60s d'une fonction Vercel en une seule requête,
// d'où la pagination explicite appelée depuis plusieurs requêtes HTTP
// séparées, voir app/api/admin/backfill-mastr).
export async function fetchWindTurbinesPage(page, pageSize = 5000) {
  const filter = `Energieträger~eq~${ENERGIETRAEGER_WIND}~and~Betriebs-Status~eq~${BETRIEBS_STATUS_IN_BETRIEB}`;
  const url = `${BASE_URL}?filter=${encodeURIComponent(filter)}&page=${page}&pageSize=${pageSize}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MaStR fetch failed: ${res.status}`);
  const json = await res.json();
  const turbines = [];
  for (const d of json.Data || []) {
    if (d.Breitengrad == null || d.Laengengrad == null || d.Nettonennleistung == null) continue;
    turbines.push({
      lat: d.Breitengrad,
      lon: d.Laengengrad,
      capacityKw: d.Nettonennleistung,
      offshore: d.WindAnLandOderSeeBezeichnung === "Windkraft auf See",
    });
  }
  return { turbines, total: json.Total ?? 0 };
}

// Récupère la totalité des éoliennes en service (pagination par blocs de
// 5000 — le total actuel est d'environ 32 000 unités, donc ~7 appels).
// CONSERVÉ pour usage local/hors Vercel — trop long pour une seule
// invocation serverless (voir fetchWindTurbinesPage + backfill-mastr pour
// l'usage réel en production).
export async function fetchAllWindTurbines() {
  const filter = `Energieträger~eq~${ENERGIETRAEGER_WIND}~and~Betriebs-Status~eq~${BETRIEBS_STATUS_IN_BETRIEB}`;
  const pageSize = 5000;
  let page = 1;
  let total = Infinity;
  const all = [];
  while ((page - 1) * pageSize < total) {
    const url = `${BASE_URL}?filter=${encodeURIComponent(filter)}&page=${page}&pageSize=${pageSize}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MaStR fetch failed: ${res.status}`);
    const json = await res.json();
    total = json.Total ?? 0;
    for (const d of json.Data || []) {
      if (d.Breitengrad == null || d.Laengengrad == null || d.Nettonennleistung == null) continue;
      all.push({
        lat: d.Breitengrad,
        lon: d.Laengengrad,
        capacityKw: d.Nettonennleistung,
        offshore: d.WindAnLandOderSeeBezeichnung === "Windkraft auf See",
      });
    }
    page++;
  }
  return all;
}

// Agrège les turbines individuelles en grille (résolution ~0.5° lat x
// 0.75° lon, ~55km à la latitude allemande) pondérée par capacité nette
// cumulée — bien plus précis que les 8 points par Land utilisés jusqu'ici,
// tout en gardant un nombre de points météo raisonnable pour l'API
// Open-Meteo (évite d'interroger individuellement 32 000 positions).
export function aggregateToGrid(turbines, latStep = 0.5, lonStep = 0.75) {
  const onshoreCells = new Map();
  const offshoreCells = new Map();
  for (const t of turbines) {
    const cellLat = Math.round(t.lat / latStep) * latStep;
    const cellLon = Math.round(t.lon / lonStep) * lonStep;
    const key = `${cellLat.toFixed(3)},${cellLon.toFixed(3)}`;
    const cells = t.offshore ? offshoreCells : onshoreCells;
    const entry = cells.get(key) || { lat: cellLat, lon: cellLon, weight: 0 };
    entry.weight += t.capacityKw;
    cells.set(key, entry);
  }
  return {
    onshore: [...onshoreCells.values()].sort((a, b) => b.weight - a.weight),
    offshore: [...offshoreCells.values()].sort((a, b) => b.weight - a.weight),
  };
}
