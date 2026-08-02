// lib/weather.js
// Intégration Open-Meteo / DWD ICON-D2 — modèle météo allemand officiel,
// gratuit, sans clé, mis à jour toutes les 1-3h (contre 1x/jour pour la
// prévision ENTSO-E), résolution 2,2 km sur l'Allemagne. Sert de base au
// modèle de prévision éolien/solaire "maison" (Forecast for Trading).

import { windCapacityFactor, airDensityFactor, solarFeature } from "./physics";

// Points représentatifs par filière, pondérés par la capacité installée
// réelle par Land (source: Deutsche WindGuard/BWE pour l'éolien, données
// Bundesnetzagentur/MaStR pour le solaire, cf. strom-report.com — chiffres
// éolien terrestre au 01.01.2024, solaire au 01.2026). Retient les Länder
// couvrant ~80-85% de la capacité nationale par filière. Amélioration
// future prévue: positions de parcs individuels via le Marktstammdaten-
// register (MaStR).
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

// Variables météo requises par filière. Vent: vitesse à 100m + température
// + pression de surface (nécessaires à la correction de densité de l'air —
// voir lib/physics.js). Solar: irradiance + température (dérating
// thermique). cloud_cover volontairement PAS demandé: shortwave_radiation
// (sortie du modèle NWP) intègre déjà l'effet de la couverture nuageuse —
// un terme cloud_cover séparé serait redondant et risquerait de produire
// des prédictions non nulles la nuit.
function varsFor(fuel) {
  return fuel === "Solar" ? "shortwave_radiation,temperature_2m" : "wind_speed_100m,temperature_2m,surface_pressure";
}

// Prévision météo (DWD ICON-D2, jusqu'à 7 jours, mise à jour toutes les 1-3h).
export async function fetchWeatherForecast(fuel, days = 7) {
  const points = WEATHER_POINTS[fuel];
  const { lat, lon } = pointsToParams(points);
  const url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${lat}&longitude=${lon}&hourly=${varsFor(fuel)}&forecast_days=${days}&timezone=UTC&wind_speed_unit=ms`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo forecast failed: ${res.status}`);
  const json = await res.json();
  const locations = Array.isArray(json) ? json : [json];
  return aggregateLocations(locations, fuel);
}

// Historique météo (archive Open-Meteo, dispo depuis 2021) — pour calibrer
// le modèle contre le réalisé déjà stocké (market_generation).
export async function fetchWeatherHistorical(fuel, startDate, endDate) {
  const points = WEATHER_POINTS[fuel];
  const { lat, lon } = pointsToParams(points);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=${varsFor(fuel)}&timezone=UTC&wind_speed_unit=ms`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo archive failed: ${res.status}`);
  const json = await res.json();
  const locations = Array.isArray(json) ? json : [json];
  return aggregateLocations(locations, fuel);
}

// Agrégation Jensen-correcte: le facteur de charge éolien (courbe de
// puissance cubique par tronçons) est une fonction NON LINÉAIRE du vent.
// moyenne(courbe(vent)) ≠ courbe(moyenne(vent)) — faire la moyenne des
// vitesses de vent PUIS appliquer la courbe introduit un biais systématique
// (inégalité de Jensen). On calcule donc le facteur de charge (et, pour le
// vent, la correction de densité de l'air) POINT PAR POINT, et on ne
// pondère/moyenne QU'ENSUITE ces facteurs déjà non-linéaires — jamais les
// variables météo brutes en amont d'une fonction non linéaire.
function aggregateLocations(locations, fuel) {
  const points = WEATHER_POINTS[fuel];
  const totalWeight = points.reduce((s, p) => s + p.weight, 0);
  const time = locations[0]?.hourly?.time || [];
  const out = [];
  for (let i = 0; i < time.length; i++) {
    let sum = 0, weightUsed = 0;
    for (let j = 0; j < locations.length; j++) {
      const h = locations[j]?.hourly;
      if (!h) continue;
      let f;
      if (fuel === "Solar") {
        const radiation = h.shortwave_radiation?.[i];
        const temp = h.temperature_2m?.[i];
        if (radiation === undefined || radiation === null) continue;
        f = solarFeature(radiation, temp);
      } else {
        const v = h.wind_speed_100m?.[i];
        const temp = h.temperature_2m?.[i];
        const pressure = h.surface_pressure?.[i];
        if (v === undefined || v === null) continue;
        f = windCapacityFactor(v) * airDensityFactor(temp, pressure);
      }
      sum += f * points[j].weight;
      weightUsed += points[j].weight;
    }
    out.push({ timestamp: `${time[i]}:00Z`, feature: weightUsed > 0 ? sum / weightUsed : null });
  }
  return out;
}
