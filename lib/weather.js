// lib/weather.js
// Intégration Open-Meteo / DWD ICON-D2 — modèle météo allemand officiel,
// gratuit, sans clé, mis à jour toutes les 1-3h (contre 1x/jour pour la
// prévision ENTSO-E), résolution 2,2 km sur l'Allemagne. Sert de base au
// modèle de prévision éolien/solaire "maison" (Forecast for Trading).
//
// Points représentatifs par filière (moyenne simple, pas de pondération
// par capacité installée pour cette V1 — amélioration possible plus tard):
// - Wind Onshore: zones à forte capacité éolienne terrestre (nord/est)
// - Wind Offshore: mer du Nord + mer Baltique
// - Solar: répartition nationale (Bavière, Bade-Wurtemberg, NRW,
//   Brandebourg, Saxe)

// Points représentatifs par filière, pondérés par la capacité installée
// réelle par Land (source: Deutsche WindGuard/BWE pour l'éolien, données
// Bundesnetzagentur/MaStR pour le solaire, cf. strom-report.com — chiffres
// éolien terrestre au 01.01.2024, solaire au 01.2026). Retient les Länder
// couvrant ~80-85% de la capacité nationale par filière — au-delà, le
// gain de précision par Land supplémentaire est marginal face au coût en
// appels API. Amélioration future prévue: passage à des positions de
// parcs individuels via le Marktstammdatenregister (MaStR).
const WIND_ONSHORE_POINTS = [
  { lat: 52.6, lon: 9.0, weight: 12542 },   // Niedersachsen
  { lat: 52.4, lon: 13.5, weight: 8662 },   // Brandenburg
  { lat: 54.2, lon: 9.7, weight: 8549 },    // Schleswig-Holstein
  { lat: 51.4, lon: 7.5, weight: 7153 },    // Nordrhein-Westfalen
  { lat: 51.9, lon: 11.5, weight: 5331 },   // Sachsen-Anhalt
  { lat: 50.1, lon: 7.3, weight: 4005 },    // Rheinland-Pfalz
  { lat: 53.6, lon: 12.9, weight: 3722 },   // Mecklenburg-Vorpommern
  { lat: 48.9, lon: 11.4, weight: 2636 },   // Bayern
];
const WIND_OFFSHORE_POINTS = [
  { lat: 54.5, lon: 6.5, weight: 7110 },    // Mer du Nord (Deutsche Bucht)
  { lat: 54.8, lon: 13.0, weight: 1354 },   // Mer Baltique
];
const SOLAR_POINTS = [
  { lat: 48.9, lon: 11.4, weight: 31452 },  // Bayern
  { lat: 48.7, lon: 9.2, weight: 14640 },   // Bade-Wurtemberg
  { lat: 51.4, lon: 7.5, weight: 14218 },   // Rhénanie-du-Nord-Westphalie
  { lat: 52.6, lon: 9.0, weight: 10387 },   // Basse-Saxe
  { lat: 52.4, lon: 13.5, weight: 8858 },   // Brandebourg
  { lat: 50.1, lon: 7.3, weight: 5936 },    // Rhénanie-Palatinat
  { lat: 51.1, lon: 13.4, weight: 5437 },   // Saxe
  { lat: 50.6, lon: 9.0, weight: 5405 },    // Hesse
];

export const WEATHER_POINTS = {
  "Wind Onshore": WIND_ONSHORE_POINTS,
  "Wind Offshore": WIND_OFFSHORE_POINTS,
  Solar: SOLAR_POINTS,
};

function pointsToParams(points) {
  return {
    lat: points.map((p) => p.lat).join(","),
    lon: points.map((p) => p.lon).join(","),
  };
}

// Prévision météo (DWD ICON-D2, jusqu'à 7 jours, mise à jour toutes les 1-3h).
// Renvoie la moyenne des points représentatifs à chaque heure.
export async function fetchWeatherForecast(fuel, days = 7) {
  const points = WEATHER_POINTS[fuel];
  const { lat, lon } = pointsToParams(points);
  const vars = fuel === "Solar" ? "shortwave_radiation,temperature_2m,cloud_cover" : "wind_speed_100m,wind_speed_10m";
  const url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${lat}&longitude=${lon}&hourly=${vars}&forecast_days=${days}&timezone=UTC&wind_speed_unit=ms`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo forecast failed: ${res.status}`);
  const json = await res.json();
  const locations = Array.isArray(json) ? json : [json];
  return averageLocations(locations, fuel);
}

// Historique météo (archive Open-Meteo, dispo depuis 2021) — pour calibrer
// le modèle contre le réalisé déjà stocké (market_generation).
export async function fetchWeatherHistorical(fuel, startDate, endDate) {
  const points = WEATHER_POINTS[fuel];
  const { lat, lon } = pointsToParams(points);
  const vars = fuel === "Solar" ? "shortwave_radiation,temperature_2m,cloud_cover" : "wind_speed_100m,wind_speed_10m";
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=${vars}&timezone=UTC&wind_speed_unit=ms`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo archive failed: ${res.status}`);
  const json = await res.json();
  const locations = Array.isArray(json) ? json : [json];
  return averageLocations(locations, fuel);
}

// Moyenne pondérée par capacité installée (weight) des points représentatifs
// à chaque pas de temps horaire.
function averageLocations(locations, fuel) {
  const points = WEATHER_POINTS[fuel];
  const totalWeight = points.reduce((s, p) => s + p.weight, 0);
  const time = locations[0]?.hourly?.time || [];
  const out = [];
  for (let i = 0; i < time.length; i++) {
    const row = { timestamp: `${time[i]}:00Z` };
    if (fuel === "Solar") {
      row.radiation = weightedAt(locations, points, totalWeight, "shortwave_radiation", i);
      row.temperature = weightedAt(locations, points, totalWeight, "temperature_2m", i);
      row.cloudCover = weightedAt(locations, points, totalWeight, "cloud_cover", i);
    } else {
      row.windSpeed100m = weightedAt(locations, points, totalWeight, "wind_speed_100m", i);
      row.windSpeed10m = weightedAt(locations, points, totalWeight, "wind_speed_10m", i);
    }
    out.push(row);
  }
  return out;
}
function weightedAt(locations, points, totalWeight, key, i) {
  let sum = 0, weightUsed = 0;
  for (let j = 0; j < locations.length; j++) {
    const v = locations[j]?.hourly?.[key]?.[i];
    if (v === undefined || v === null) continue;
    sum += v * points[j].weight;
    weightUsed += points[j].weight;
  }
  if (weightUsed === 0) return null;
  return sum / weightUsed;
}
