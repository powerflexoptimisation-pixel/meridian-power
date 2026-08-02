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

const WIND_ONSHORE_POINTS = [
  { lat: 54.3, lon: 9.5 },   // Schleswig-Holstein
  { lat: 53.2, lon: 8.0 },   // Basse-Saxe (côte)
  { lat: 53.8, lon: 12.5 },  // Mecklembourg-Poméranie
  { lat: 52.5, lon: 13.5 },  // Brandebourg
  { lat: 51.9, lon: 11.5 },  // Saxe-Anhalt
];
const WIND_OFFSHORE_POINTS = [
  { lat: 54.5, lon: 6.5 },   // Mer du Nord
  { lat: 54.8, lon: 13.0 },  // Mer Baltique
];
const SOLAR_POINTS = [
  { lat: 48.9, lon: 11.4 },  // Bavière
  { lat: 48.7, lon: 9.2 },   // Bade-Wurtemberg
  { lat: 51.4, lon: 7.5 },   // Rhénanie-du-Nord-Westphalie
  { lat: 52.4, lon: 13.0 },  // Brandebourg
  { lat: 51.1, lon: 13.4 },  // Saxe
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

// Moyenne simple des points représentatifs à chaque pas de temps horaire.
function averageLocations(locations, fuel) {
  const n = locations.length;
  const time = locations[0]?.hourly?.time || [];
  const out = [];
  for (let i = 0; i < time.length; i++) {
    const row = { timestamp: `${time[i]}:00Z` };
    if (fuel === "Solar") {
      row.radiation = avgAt(locations, "shortwave_radiation", i);
      row.temperature = avgAt(locations, "temperature_2m", i);
      row.cloudCover = avgAt(locations, "cloud_cover", i);
    } else {
      row.windSpeed100m = avgAt(locations, "wind_speed_100m", i);
      row.windSpeed10m = avgAt(locations, "wind_speed_10m", i);
    }
    out.push(row);
  }
  return out;
}
function avgAt(locations, key, i) {
  const vals = locations.map((l) => l.hourly?.[key]?.[i]).filter((v) => v !== undefined && v !== null);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}
