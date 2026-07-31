// lib/tz.js
// Les marchés day-ahead européens (ENTSO-E, zone CWE/Core) sont organisés en
// journées CET/CEST (Europe/Berlin), pas en UTC. Ce helper calcule l'instant
// UTC correspondant à minuit heure de Berlin, en tenant compte du changement
// d'heure été/hiver (CEST = UTC+2, CET = UTC+1).

export const MARKET_TZ = "Europe/Berlin";

// Renvoie l'instant UTC de minuit (heure de Berlin) pour "aujourd'hui - daysAgo"
// (daysAgo=0 -> minuit Berlin du jour courant, daysAgo=1 -> hier, etc.)
export function berlinMidnightUTC(daysAgo = 0) {
  const now = new Date();
  const berlinDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = berlinDateStr.split("-").map(Number);

  // Première estimation: minuit Berlin ~= minuit UTC du même jour calendaire local, décalé.
  const guess = new Date(Date.UTC(y, m - 1, d - daysAgo, 0, 0, 0));

  // On détermine le décalage horaire réel de Berlin à cet instant (+1 ou +2h)
  // en formatant l'instant devinée dans le fuseau cible.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(guess);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
  const match = offsetPart.match(/GMT([+-]\d+)/);
  const offsetHours = match ? parseInt(match[1], 10) : 0;

  return new Date(guess.getTime() - offsetHours * 3600 * 1000);
}
