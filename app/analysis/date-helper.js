// app/analysis/date-helper.js
// Petit helper client-side (pas de dépendance à lib/tz.js server-only)
// pour calculer "hier" en heure de Berlin, au format YYYY-MM-DD.

export function berlinYesterdayISO() {
  const now = new Date();
  const berlinDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = berlinDateStr.split("-").map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1));
  return yesterday.toISOString().slice(0, 10);
}
