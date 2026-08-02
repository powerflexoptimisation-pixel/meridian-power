// lib/physics.js
// Fonctions physiques partagées entre lib/weather.js (agrégation par point
// météo — doit être Jensen-correcte, voir plus bas) et lib/forecast-model.js
// (régression sur le facteur déjà agrégé).

// Facteur de charge éolien normalisé (0-1) à partir de la vitesse du vent
// à 100m (m/s). Courbe de puissance générique de turbine moderne.
export function windCapacityFactor(v) {
  const cutIn = 3, rated = 13, cutOut = 25;
  if (v == null || v < cutIn || v >= cutOut) return 0;
  if (v >= rated) return 1;
  const t = (v - cutIn) / (rated - cutIn);
  return Math.pow(t, 3);
}

// Correction de densité de l'air: la puissance éolienne est proportionnelle
// à ρ (densité de l'air), pas seulement à v³. Air froid/dense = plus de
// puissance à vitesse de vent égale. ρ = P/(R·T) [gaz parfait], comparé à
// la densité standard (1,225 kg/m³ à 15°C, 1013,25 hPa — conditions de
// certification des courbes de puissance constructeur).
const STANDARD_AIR_DENSITY = 1.225;
export function airDensityFactor(temperatureC, pressureHpa) {
  if (temperatureC == null || pressureHpa == null) return 1;
  const T = temperatureC + 273.15;
  const P = pressureHpa * 100;
  const rho = P / (287.05 * T);
  return rho / STANDARD_AIR_DENSITY;
}

// Feature solaire: irradiance avec dérating thermique simple (-0.4%/°C
// au-delà de 25°C, standard silicium cristallin). shortwave_radiation
// (DWD ICON) intègre déjà l'effet de la couverture nuageuse au niveau du
// modèle météo — un terme cloud_cover séparé serait redondant et risquerait
// de produire des prédictions non nulles la nuit (radiation=0 mais
// cloud_cover>0), donc volontairement écarté.
export function solarFeature(radiation, temperatureC) {
  if (radiation == null) return 0;
  const derate = temperatureC != null && temperatureC > 25 ? 1 - 0.004 * (temperatureC - 25) : 1;
  return radiation * Math.max(derate, 0.7);
}
