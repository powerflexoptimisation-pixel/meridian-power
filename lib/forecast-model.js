// lib/forecast-model.js
// Modèle physique simple pour convertir la météo (vent/irradiance) en
// production électrique estimée, calibré par régression linéaire contre
// l'historique de génération réelle (market_generation) déjà en base.
//
// Approche volontairement simple pour cette V1 (pas de ML lourd):
// - Wind: courbe de puissance approximative (cubique entre cut-in et
//   rated, plateau ensuite, coupure en cas de vent trop fort), puis
//   régression linéaire (facteur de charge -> MW réel) pour calibrer
//   l'échelle sur la capacité installée réelle.
// - Solar: relation quasi-linéaire irradiance -> MW, avec un terme de
//   dérating thermique simple (les panneaux perdent en rendement à haute
//   température).
// Amélioration future possible: pondération par capacité régionale,
// modèle non-linéaire (arbre de décision / gradient boosting), plus de
// points météo.

// Facteur de charge éolien normalisé (0-1) à partir de la vitesse du vent
// à 100m (m/s). Courbe de puissance générique de turbine moderne.
function windCapacityFactor(v) {
  const cutIn = 3, rated = 13, cutOut = 25;
  if (v == null || v < cutIn || v >= cutOut) return 0;
  if (v >= rated) return 1;
  const t = (v - cutIn) / (rated - cutIn);
  return Math.pow(t, 3);
}

// Régression linéaire simple (moindres carrés) y = a*x + b.
function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 10) return null;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const a = den === 0 ? 0 : num / den;
  const b = meanY - a * meanX;
  return { a, b };
}

// Prépare les features (x) à partir de la météo brute, selon la filière.
export function computeFeature(fuel, weatherRow) {
  if (fuel === "Solar") {
    // Dérating thermique simple: -0.4%/°C au-delà de 25°C (standard silicium cristallin).
    const derate = weatherRow.temperature != null && weatherRow.temperature > 25
      ? 1 - 0.004 * (weatherRow.temperature - 25)
      : 1;
    return (weatherRow.radiation || 0) * Math.max(derate, 0.7);
  }
  return windCapacityFactor(weatherRow.windSpeed100m);
}

// Calibre le modèle (régression) à partir de séries [{timestamp, feature}]
// et de la génération réelle correspondante {timestamp -> MW}.
export function calibrate(weatherRows, actualByTs, fuel) {
  const xs = [];
  const ys = [];
  for (const row of weatherRows) {
    const actual = actualByTs.get(row.timestamp);
    if (actual == null) continue;
    const x = computeFeature(fuel, row);
    xs.push(x);
    ys.push(actual);
  }
  const fit = linearRegression(xs, ys);
  if (!fit) return null;
  // Le modèle ne doit jamais prédire négatif (physiquement impossible).
  return { ...fit, n_points: xs.length, fuel };
}

// Applique un modèle calibré à une série météo pour produire une prévision (MW).
export function predict(model, weatherRows, fuel) {
  return weatherRows.map((row) => {
    const x = computeFeature(fuel, row);
    const y = Math.max(0, model.a * x + model.b);
    return { timestamp: row.timestamp, quantity_mw: y };
  });
}
