// lib/osm-wind.js
// Positions individuelles des éoliennes allemandes via OpenStreetMap/
// Overpass API (gratuit, sans inscription) — solution de démarrage rapide
// en attendant l'accès complet au Marktstammdatenregister (MaStR, données
// officielles plus précises mais nécessitant une inscription API SOAP).
//
// Note sur le serveur Overpass: l'instance publique par défaut
// (overpass-api.de) s'est montrée peu fiable pour ce volume de requêtes
// (timeouts/rate-limit systématiques lors des tests) — on utilise le
// miroir overpass.kumi.systems, nettement plus stable dans nos tests.
//
// Les éoliennes individuelles sont agrégées en grille (0,25° — environ
// 25-28km à ces latitudes) pour servir de points de pondération météo
// (remplace les 8 centroïdes de Länder actuels par une grille beaucoup
// plus fine et directement basée sur la position réelle des parcs).

const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const GRID_SIZE = 0.25;

// Capacité par défaut pour les éoliennes sans tag de puissance explicite
// (environ 44% des entités taguées dans nos tests) — moyenne raisonnable
// pour une éolienne terrestre moderne. À affiner avec MaStR plus tard.
const DEFAULT_CAPACITY_KW = 3000;

function parseCapacityKw(tags) {
  const raw = tags?.["generator:output:electricity"];
  if (!raw) return null;
  const match = String(raw).trim().match(/^([\d.,]+)\s*([kKmMgG]?)[wW]/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(",", "."));
  if (Number.isNaN(value)) return null;
  const unit = match[2].toLowerCase();
  if (unit === "m") return value * 1000; // MW -> kW
  if (unit === "g") return value * 1000000; // GW -> kW
  return value; // déjà en kW (ou W négligeable, ignoré ici)
}

function gridCell(lat, lon) {
  return {
    lat: Math.floor(lat / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2,
    lon: Math.floor(lon / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2,
  };
}

// Récupère les éoliennes dans une zone (bbox: "south,west,north,east") et
// les agrège directement en grille — évite de stocker des dizaines de
// milliers de points individuels pour un usage qui n'en a pas besoin.
export async function fetchWindTurbinesGrid(bbox) {
  const query = `[out:json][timeout:40];(node["generator:source"="wind"](${bbox}););out body;`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "MeridianPower/1.0 (energy market data platform; contact: power.flex.optimisation@gmail.com)",
      Accept: "application/json",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass failed: ${res.status}`);
  const json = await res.json();
  const elements = json.elements || [];

  const grid = new Map();
  for (const el of elements) {
    if (el.lat == null || el.lon == null) continue;
    const cell = gridCell(el.lat, el.lon);
    const key = `${cell.lat.toFixed(3)},${cell.lon.toFixed(3)}`;
    const capacityKw = parseCapacityKw(el.tags) ?? DEFAULT_CAPACITY_KW;
    const entry = grid.get(key) || { lat: cell.lat, lon: cell.lon, capacity_mw: 0, turbine_count: 0 };
    entry.capacity_mw += capacityKw / 1000;
    entry.turbine_count += 1;
    grid.set(key, entry);
  }
  return [...grid.values()];
}
