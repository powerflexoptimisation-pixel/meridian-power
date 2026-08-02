// lib/forecast-model.js
// Régression linéaire (par l'origine) entre la feature météo déjà agrégée
// de façon Jensen-correcte (voir lib/weather.js: facteur de charge éolien
// avec correction de densité de l'air, ou feature solaire avec dérating
// thermique — calculés point par point puis pondérés, jamais l'inverse) et
// la génération réelle historique (market_generation).
//
// Amélioration future possible: modèle non-linéaire (arbre de décision /
// gradient boosting) au lieu d'une simple régression linéaire; pondération
// par position exacte des parcs (Marktstammdatenregister) au lieu de la
// pondération par capacité régionale actuelle.

// Régression linéaire par l'origine (y = a*x, sans intercept) — moindres
// carrés avec b forcé à 0. Physiquement justifié: à vent nul (ou irradiance
// nulle), la production DOIT être 0 MW. Une régression avec intercept libre
// laisse souvent b prendre une valeur positive significative qui écrase le
// vrai signal météo pendant les périodes de faible production — précisément
// les moments où la réactivité de la prévision compte le plus.
function linearRegressionThroughOrigin(xs, ys) {
  const n = xs.length;
  if (n < 10) return null;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += xs[i] * ys[i];
    den += xs[i] * xs[i];
  }
  const a = den === 0 ? 0 : num / den;
  return { a, b: 0 };
}

// Calibre le modèle à partir de la série météo (déjà agrégée en feature
// Jensen-correcte par lib/weather.js) et de la génération réelle
// correspondante {epoch ms -> MW}.
export function calibrate(weatherRows, actualByTs) {
  const xs = [];
  const ys = [];
  for (const row of weatherRows) {
    if (row.feature == null) continue;
    const actual = actualByTs.get(new Date(row.timestamp).getTime());
    if (actual == null) continue;
    xs.push(row.feature);
    ys.push(actual);
  }
  const fit = linearRegressionThroughOrigin(xs, ys);
  if (!fit) return null;
  return { ...fit, n_points: xs.length };
}

// Applique un modèle calibré à une série météo pour produire une prévision (MW).
export function predict(model, weatherRows) {
  return weatherRows
    .filter((row) => row.feature != null)
    .map((row) => ({ timestamp: row.timestamp, quantity_mw: Math.max(0, model.a * row.feature) }));
}
