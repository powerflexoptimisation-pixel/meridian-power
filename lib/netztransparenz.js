// lib/netztransparenz.js
// Intégration API netztransparenz.de (données propres à l'Allemagne, portail
// commun des 4 GRT: 50Hertz, Amprion, TenneT, TransnetBW).
// Auth OAuth2 client_credentials, token valable 1h (mis en cache en mémoire).
// Données renvoyées en CSV (locale allemande: ';' séparateur, ',' décimale).

const TOKEN_URL = "https://identity.netztransparenz.de/users/connect/token";
const BASE_URL = "https://ds.netztransparenz.de/api/v1/data";

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken;

  const clientId = process.env.NETZTRANSPARENZ_CLIENT_ID;
  const clientSecret = process.env.NETZTRANSPARENZ_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NETZTRANSPARENZ_CLIENT_ID / NETZTRANSPARENZ_CLIENT_SECRET manquants");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`netztransparenz OAuth failed: ${res.status}`);
  const json = await res.json();
  cachedToken = json.access_token;
  // Marge de sécurité de 60s avant l'expiration réelle (1h).
  cachedTokenExpiry = now + (json.expires_in - 60) * 1000;
  return cachedToken;
}

// Formate une Date JS en "yyyy-MM-ddTHH:mm:ss" (heure locale UTC, attendu par l'API).
function fmtDateParam(d) {
  return d.toISOString().slice(0, 19);
}

// Parseur CSV générique pour le format netztransparenz (';' + décimale ',').
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(";").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
  return { headers, rows };
}

function parseGermanNumber(s) {
  if (s === undefined || s === null || s === "") return null;
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function parseGermanDate(datum, zeit) {
  // datum: "DD.MM.YYYY", zeit: "HH:MM" (toujours en UTC pour cette API)
  const [day, month, year] = datum.split(".");
  return `${year}-${month}-${day}T${zeit}:00Z`;
}

async function fetchCsv(path, dateFrom, dateTo) {
  const token = await getAccessToken();
  const url = `${BASE_URL}/${path}/${fmtDateParam(dateFrom)}/${fmtDateParam(dateTo)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 404) return { headers: [], rows: [] };
    throw new Error(`netztransparenz ${path} failed: ${res.status}`);
  }
  const text = await res.text();
  return parseCsv(text);
}

// reBAP: prix de l'énergie de compensation (Ausgleichsenergiepreis), 15-min.
export async function fetchReBAP(dateFrom, dateTo) {
  const { rows } = await fetchCsv("nrvsaldo/reBAP/Qualitaetsgesichert", dateFrom, dateTo);
  return rows
    .filter((r) => r["Datum"] && r["von"])
    .map((r) => ({
      timestamp: parseGermanDate(r["Datum"], r["von"]),
      rebap_unterdeckt: parseGermanNumber(r["reBAP unterdeckt"]),
      rebap_ueberdeckt: parseGermanNumber(r["reBAP ueberdeckt"]),
    }));
}

// RZ-Saldo: solde de la zone de réglage par GRT (MW), 15-min.
export async function fetchRZSaldo(dateFrom, dateTo) {
  const { rows } = await fetchCsv("NrvSaldo/RZSaldo/Qualitaetsgesichert", dateFrom, dateTo);
  return rows
    .filter((r) => r["Datum"] && r["von"])
    .map((r) => ({
      timestamp: parseGermanDate(r["Datum"], r["von"]),
      "50Hertz": parseGermanNumber(r["50Hertz"]),
      "Amprion": parseGermanNumber(r["Amprion"]),
      "TenneT TSO": parseGermanNumber(r["TenneT TSO"]),
      "TransnetBW": parseGermanNumber(r["TransnetBW"]),
    }));
}

// Redispatch: événements de congestion (pas une série temporelle régulière).
export async function fetchRedispatch(dateFrom, dateTo) {
  const { rows } = await fetchCsv("redispatch", dateFrom, dateTo);
  return rows
    .filter((r) => r["BEGINN_DATUM"])
    .map((r) => ({
      start: parseGermanDate(r["BEGINN_DATUM"], r["BEGINN_UHRZEIT"]),
      end: parseGermanDate(r["ENDE_DATUM"], r["ENDE_UHRZEIT"]),
      reason: r["GRUND_DER_MASSNAHME"],
      direction: r["RICHTUNG"],
      avgPowerMw: parseGermanNumber(r["MITTLERE_LEISTUNG_MW"]),
      maxPowerMw: parseGermanNumber(r["MAXIMALE_LEISTUNG_MW"]),
      totalEnergyMwh: parseGermanNumber(r["GESAMTE_ARBEIT_MWH"]),
      orderingTso: r["ANWEISENDER_UENB"],
      requestingTso: r["ANFORDERNDER_UENB"],
      plant: r["BETROFFENE_ANLAGE"],
      energySource: r["PRIMAERENERGIEART"],
    }));
}
