// lib/netztransparenz.js
// Intégration avec l'API des 4 gestionnaires de réseau de transport allemands
// (50Hertz, Amprion, TenneT, TransnetBW) via netztransparenz.de.
// Auth: OAuth2 client_credentials, token valable 1h (mis en cache en mémoire
// process — suffisant pour une fonction serverless qui vit quelques minutes).
// Données renvoyées en CSV (séparateur ';', décimales avec ',', format allemand).

const TOKEN_URL = "https://identity.netztransparenz.de/users/connect/token";
const API_BASE = "https://ds.netztransparenz.de/api/v1";

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry - 60000) {
    return cachedToken;
  }
  const clientId = process.env.NETZTRANSPARENZ_CLIENT_ID;
  const clientSecret = process.env.NETZTRANSPARENZ_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NETZTRANSPARENZ_CLIENT_ID / NETZTRANSPARENZ_CLIENT_SECRET manquants");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`netztransparenz auth failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text);
  cachedToken = json.access_token;
  cachedTokenExpiry = now + (json.expires_in ? json.expires_in * 1000 : 3600000);
  return cachedToken;
}

// Récupère les données brutes CSV d'un endpoint de la Daten-API pour une plage donnée.
export async function fetchNtpRaw(path, dateFrom, dateTo) {
  const token = await getAccessToken();
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const url = `${API_BASE}/${path}${params.toString() ? "?" + params.toString() : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`netztransparenz ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return text;
}

// Parseur CSV générique adapté au format Netztransparenz (';' séparateur,
// ',' décimales, en-têtes sur la première ligne).
export function parseNtpCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(";").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i].trim() : ""; });
    return row;
  });
  return { headers, rows };
}

// Convertit un nombre au format allemand ("1.234,56" ou "12,5") en Number JS.
export function parseGermanNumber(s) {
  if (s === undefined || s === null || s === "") return null;
  const cleaned = String(s).replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}
